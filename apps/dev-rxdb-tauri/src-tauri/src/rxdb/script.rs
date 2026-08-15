//! SQL 文本分析：脚本切分与只读判定。
//!
//! 两者都是从 JS 侧**逐字移植**过来的，不是重新设计：
//!
//! - 切分 → `packages/rxdb-adapter-desktop/src/sqlite-script.ts`（它本身又是 SQLite
//!   `complete.c` 的移植，即 `sqlite3_complete()` 的状态机）
//! - 只读判定 → `packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts`
//!
//! 为什么不用现成的 SQLite 设施？
//!
//! - 切分不用增量调 `sqlite3_complete()`：它只对整串返回一个布尔，要切位置就得对每个前缀
//!   调一次，O(n²) 且每次都要新建一个 `CString`。状态机移植过来是同一份判据，还便宜。
//! - 只读判定不用 `Statement::readonly()`：它比正则**更准**，而共享套件
//!   (`rowsAffectedConformanceSuite`) 断言的正是正则那一份行为。这里要的是与 wasm/Electron
//!   后端逐字一致，不是更聪明。

const TOKEN_SEMI: usize = 0;
const TOKEN_WS: usize = 1;
const TOKEN_OTHER: usize = 2;
const TOKEN_EXPLAIN: usize = 3;
const TOKEN_CREATE: usize = 4;
const TOKEN_TEMP: usize = 5;
const TOKEN_TRIGGER: usize = 6;
const TOKEN_END: usize = 7;

/// 「刚好读完一条完整语句」的状态，即 `sqlite3_complete()` 的返回条件。
const STATE_COMPLETE: usize = 1;

/// `complete.c` 的状态转移表。
///
/// 行是状态（0 INVALID / 1 START / 2 NORMAL / 3 EXPLAIN / 4 CREATE / 5 TRIGGER / 6 SEMI / 7 END），
/// 列是记号（SEMI / WS / OTHER / EXPLAIN / CREATE / TEMP / TRIGGER / END）。
/// 状态 5、6 是 `CREATE [TEMP] TRIGGER` 的体内：这两行的 SEMI 列不回到 1，
/// 触发器体内的分号因此不会被当成语句边界。
const TRANSITIONS: [[usize; 8]; 8] = [
    [1, 0, 2, 3, 4, 2, 2, 2],
    [1, 1, 2, 3, 4, 2, 2, 2],
    [1, 2, 2, 2, 2, 2, 2, 2],
    [1, 3, 3, 2, 4, 2, 2, 2],
    [1, 4, 2, 2, 2, 4, 5, 2],
    [6, 5, 5, 5, 5, 5, 5, 5],
    [6, 6, 5, 5, 5, 5, 5, 7],
    [1, 7, 5, 5, 5, 5, 5, 5],
];

/// 与 `complete.c` 的 `IdChar` 同集合：字母数字、`_`、`$`，以及一切非 ASCII 字符。
fn is_id_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '$' || !character.is_ascii()
}

/// 只有这几个关键字会影响状态机，其余标识符一律是 OTHER。
fn keyword_token(identifier: &str) -> usize {
    match identifier.to_ascii_lowercase().as_str() {
        "create" => TOKEN_CREATE,
        "temp" | "temporary" => TOKEN_TEMP,
        "trigger" => TOKEN_TRIGGER,
        "end" => TOKEN_END,
        "explain" => TOKEN_EXPLAIN,
        _ => TOKEN_OTHER,
    }
}

/// 闭合符之后的字节下标；没有闭合符时返回串尾。
fn closing_index(sql: &str, from: usize, closing: &str) -> usize {
    match sql[from..].find(closing) {
        Some(offset) => from + offset + closing.len(),
        None => sql.len(),
    }
}

fn identifier_end(sql: &str, from: usize) -> usize {
    sql[from..]
        .char_indices()
        .find(|(_, character)| !is_id_char(*character))
        .map_or(sql.len(), |(offset, _)| from + offset)
}

/// 读出 `index` 处的记号，返回 `(记号, 该记号之后的字节下标)`。
///
/// 引号不做转义处理，与 `complete.c` 一致：`'a''b'` 会被读成两个相邻的字符串记号，
/// 落到状态机上与读成一个完全等价。未闭合的引号 / 注释 / 方括号一路吃到串尾，
/// 让 SQLite 在 prepare 时报语法错。
fn read_token(sql: &str, index: usize) -> (usize, usize) {
    let rest = &sql[index..];
    let character = rest.chars().next().expect("caller keeps index inside the script");
    let after = index + character.len_utf8();
    if character == ';' {
        return (TOKEN_SEMI, after);
    }
    if matches!(character, ' ' | '\t' | '\n' | '\r' | '\u{c}') {
        return (TOKEN_WS, after);
    }
    if rest.starts_with("/*") {
        return (TOKEN_WS, closing_index(sql, index + 2, "*/"));
    }
    if rest.starts_with("--") {
        return (TOKEN_WS, closing_index(sql, index + 2, "\n"));
    }
    if character == '[' {
        return (TOKEN_OTHER, closing_index(sql, after, "]"));
    }
    if matches!(character, '"' | '\'' | '`') {
        let mut quote = [0u8; 4];
        return (TOKEN_OTHER, closing_index(sql, after, character.encode_utf8(&mut quote)));
    }
    if !is_id_char(character) {
        return (TOKEN_OTHER, after);
    }
    let end = identifier_end(sql, after);
    (keyword_token(&sql[index..end]), end)
}

/// 把一段可能含多条语句的 SQL 脚本切成单条语句。
///
/// 切片保留原文（含语句间的空白与注释），因此把结果按顺序拼回去与原串等价，
/// 报错信息里的 SQL 也仍是调用方写的那一份。只含空白或注释的片段不会成为语句。
pub fn split_sqlite_script(sql: &str) -> Vec<&str> {
    let mut statements = Vec::new();
    let mut state = 0usize;
    let mut start = 0usize;
    let mut index = 0usize;
    let mut meaningful = false;

    while index < sql.len() {
        let (token, next) = read_token(sql, index);
        state = TRANSITIONS[state][token];
        index = next;
        if token != TOKEN_WS && token != TOKEN_SEMI {
            meaningful = true;
        }
        if token != TOKEN_SEMI || state != STATE_COMPLETE {
            continue;
        }
        if meaningful {
            statements.push(&sql[start..index]);
        }
        meaningful = false;
        start = index;
    }

    if meaningful {
        statements.push(&sql[start..]);
    }
    statements
}

/// 去掉首尾空白与末尾的分号，等价于 TS 侧的 `sql.trim().replace(/;+\s*$/u, '').trimEnd()`。
fn normalize_single_statement_sql(sql: &str) -> &str {
    let trimmed = sql.trim();
    if !trimmed.ends_with(';') {
        return trimmed;
    }
    // 正则是最左匹配：`"SELECT 1; ;"` 只会掉最后那个分号，中间那个连着后面的空格躲过一劫。
    trimmed.trim_end_matches(';').trim_end()
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// `/^<keyword>\b/i`。
fn starts_with_keyword(sql: &str, keyword: &str) -> bool {
    let Some(head) = sql.get(..keyword.len()) else {
        return false;
    };
    if !head.eq_ignore_ascii_case(keyword) {
        return false;
    }
    sql.as_bytes().get(keyword.len()).is_none_or(|byte| !is_word_byte(*byte))
}

/// `/\b<word>\b/i`。
fn contains_word(sql: &str, word: &str) -> bool {
    let lowered = sql.to_ascii_lowercase();
    let bytes = lowered.as_bytes();
    lowered.match_indices(word).any(|(index, _)| {
        let before = index == 0 || !is_word_byte(bytes[index - 1]);
        let after = index + word.len();
        before && bytes.get(after).is_none_or(|byte| !is_word_byte(*byte))
    })
}

/// 判断一条语句是否不产生行变更。
///
/// 只读语句的 `rowsAffected` 必须恒为 0，否则会泄漏上一条写语句遗留的 `changes()` 计数。
/// `RETURNING` 让一条写语句同时产出行，因此带它的语句**不是**只读的。
pub fn is_read_only_statement(sql: &str) -> bool {
    let normalized = normalize_single_statement_sql(sql);
    let is_query = starts_with_keyword(normalized, "select") || starts_with_keyword(normalized, "explain");
    is_query && !contains_word(normalized, "returning")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_a_plain_script() {
        assert_eq!(split_sqlite_script("SELECT 1; SELECT 2;"), ["SELECT 1;", " SELECT 2;"]);
        assert_eq!(split_sqlite_script("SELECT 1"), ["SELECT 1"]);
        assert_eq!(split_sqlite_script(""), Vec::<&str>::new());
    }

    /// 只含空白或注释的片段不是语句——prepare 出来是空语句，会直接报错。
    #[test]
    fn drops_fragments_that_carry_no_statement() {
        assert_eq!(split_sqlite_script(";;;"), Vec::<&str>::new());
        assert_eq!(split_sqlite_script("  \n -- nothing here\n"), Vec::<&str>::new());
        assert_eq!(split_sqlite_script("/* c */ SELECT 1;"), ["/* c */ SELECT 1;"]);
    }

    /// 状态机存在的理由：触发器体内的分号不是语句边界。
    #[test]
    fn keeps_a_trigger_body_in_one_piece() {
        let script = "CREATE TEMP TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; SELECT 2; END; SELECT 3;";
        assert_eq!(
            split_sqlite_script(script),
            [
                "CREATE TEMP TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; SELECT 2; END;",
                " SELECT 3;"
            ]
        );
    }

    #[test]
    fn does_not_split_inside_quotes_comments_or_brackets() {
        assert_eq!(split_sqlite_script("SELECT ';';"), ["SELECT ';';"]);
        assert_eq!(split_sqlite_script("SELECT \";\";"), ["SELECT \";\";"]);
        assert_eq!(split_sqlite_script("SELECT `;`;"), ["SELECT `;`;"]);
        assert_eq!(split_sqlite_script("SELECT [a;b];"), ["SELECT [a;b];"]);
        assert_eq!(split_sqlite_script("SELECT 1 /* ; */;"), ["SELECT 1 /* ; */;"]);
        assert_eq!(split_sqlite_script("SELECT 1 -- ;\n;"), ["SELECT 1 -- ;\n;"]);
    }

    /// 切片必须能原样拼回去，否则报错信息里的 SQL 就不是调用方写的那一份。
    #[test]
    fn preserves_the_original_text_including_multibyte_identifiers() {
        let script = "INSERT INTO t VALUES ('名字'); SELECT \"列\";";
        assert_eq!(split_sqlite_script(script).concat(), script);
    }

    #[test]
    fn normalizes_trailing_semicolons_the_way_the_regex_does() {
        assert_eq!(normalize_single_statement_sql("  SELECT 1  "), "SELECT 1");
        assert_eq!(normalize_single_statement_sql("SELECT 1;;  "), "SELECT 1");
        assert_eq!(normalize_single_statement_sql("SELECT 1; ;"), "SELECT 1;");
        assert_eq!(normalize_single_statement_sql(";;;"), "");
    }

    #[test]
    fn classifies_read_only_statements() {
        for sql in ["SELECT 1", "  select * from t;  ", "EXPLAIN QUERY PLAN SELECT 1", "SELECT 1;;"] {
            assert!(is_read_only_statement(sql), "{sql} should be read only");
        }
    }

    /// `RETURNING` 让写语句同时产出行；`selection` 只是恰好以 select 开头的标识符。
    #[test]
    fn classifies_writes_and_lookalikes() {
        for sql in [
            "INSERT INTO t VALUES (1)",
            "INSERT INTO t VALUES (1) RETURNING id",
            "DELETE FROM t returning rowid;",
            "selection",
            "",
            "-- SELECT 1",
        ] {
            assert!(!is_read_only_statement(sql), "{sql} should not be read only");
        }
    }
}
