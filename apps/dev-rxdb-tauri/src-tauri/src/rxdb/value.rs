//! 线协议的 **JSON 传输编码**，`packages/rxdb-adapter-desktop/src/desktop-json-codec.ts` 的镜像。
//!
//! 协议本身只承诺结构化克隆可传，实际携带 `bigint` rowId、`Uint8Array` blob 与 `Date`。
//! Tauri 的 IPC 是 JSON，这三类会丢失，因此两侧各实现一份带标签的编码：
//!
//! - `{ "$bigint": "9007199254740993" }` —— 十进制字符串，不经过 `number` 中转
//! - `{ "$u8": "Zm9v" }` —— 标准 base64（`+/` 字母表、带 `=` 补位）
//! - `{ "$date": 1699999999999 }` —— epoch 毫秒
//!
//! 本文件的单测与 `__tests__/desktop-json-codec.spec.ts` 共用同一批 fixture；
//! 任何一侧走形，Tauri 传输就会在 rowId 或 blob 上悄悄丢数据。
//!
//! # 与 TS 侧的一处有意差异：`$esc`
//!
//! TS 侧支持 `{ "$esc": {...} }`，用于用户数据本身恰好长成标签形状的情况。
//! Rust 侧**不解码** `$esc`，遇到它一律报 `protocol_violation`：跨线的对象键全部由协议
//! 固定（请求字段名、应答字段名），绑定参数只可能是标量，因此 host 永远不会收到
//! 用户可控的对象键。实现一条走不到的解码分支，只会多出一处无法被测试覆盖的猜测。

use serde_json::{Map, Value};

use super::error::{ErrorCode, HostError, HostResult};

/// `bigint` 标签键。
pub const BIGINT_TAG: &str = "$bigint";
/// `Uint8Array` 标签键。
pub const BYTES_TAG: &str = "$u8";
/// `Date` 标签键。
pub const DATE_TAG: &str = "$date";
/// 转义标签键；仅用于识别并拒绝，见模块文档。
pub const ESCAPE_TAG: &str = "$esc";

/// `Number.MAX_SAFE_INTEGER`，超过它的整数在 JS 侧必须走 `$bigint`。
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn violation(message: impl Into<String>) -> HostError {
    HostError::new(ErrorCode::ProtocolViolation, message)
}

fn tagged(tag: &str, payload: Value) -> Value {
    let mut object = Map::with_capacity(1);
    object.insert(tag.to_string(), payload);
    Value::Object(object)
}

fn push_sextet(text: &mut String, bits: u32, shift: u32) {
    text.push(char::from(BASE64_ALPHABET[((bits >> shift) & 63) as usize]));
}

fn encode_base64(bytes: &[u8]) -> String {
    let mut text = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut chunks = bytes.chunks_exact(3);
    for chunk in chunks.by_ref() {
        let bits = (u32::from(chunk[0]) << 16) | (u32::from(chunk[1]) << 8) | u32::from(chunk[2]);
        for shift in [18, 12, 6, 0] {
            push_sextet(&mut text, bits, shift);
        }
    }
    let tail = chunks.remainder();
    if tail.is_empty() {
        return text;
    }
    let second = if tail.len() > 1 { u32::from(tail[1]) << 8 } else { 0 };
    let bits = (u32::from(tail[0]) << 16) | second;
    push_sextet(&mut text, bits, 18);
    push_sextet(&mut text, bits, 12);
    if tail.len() == 1 {
        text.push_str("==");
    } else {
        push_sextet(&mut text, bits, 6);
        text.push('=');
    }
    text
}

/// 单个 base64 字符 → 6 位。
///
/// 这里按**字节**扫描而 TS 侧按 UTF-16 码元扫描。两者对合法输入完全一致，
/// 对非 ASCII 输入也一致地判为非法：多字节 UTF-8 的每个字节都 >= 0x80，落在字母表外。
fn sextet(character: u8) -> HostResult<u32> {
    let value = match character {
        b'A'..=b'Z' => character - b'A',
        b'a'..=b'z' => character - b'a' + 26,
        b'0'..=b'9' => character - b'0' + 52,
        b'+' => 62,
        b'/' => 63,
        _ => {
            return Err(violation(format!(
                "{BYTES_TAG} contains a character that is not standard base64"
            )))
        }
    };
    Ok(u32::from(value))
}

/// 严格按**规范形式**解码：长度必须是 4 的倍数、补位不超过两个、尾部丢弃的位必须为 0。
///
/// 宽松解码在这里是数据完整性问题而不是风格问题：`$u8` 载荷就是用户的 blob。少掉两个字符的
/// `"Zm9vYmFy"` 在宽松解码下会安静地还原成 4 字节而不是 6 字节——一条被截断的 blob 就这样
/// 落进了库里，等到它被读出来解析失败时，现场早已不在。要求长度对齐 4 就能挡住所有
/// 非 4 倍数的截断；要求丢弃位为 0 则让编码是单射的，同一串字节只有一种合法写法。
///
/// 与 TS 侧 `desktop-json-codec.ts` 的 `decodeBase64` 逐条对应。两边的编码器都只产出规范形式，
/// 因此收严只影响手写或被篡改的载荷。
fn decode_base64(text: &str) -> HostResult<Vec<u8>> {
    let bytes = text.as_bytes();
    if !bytes.len().is_multiple_of(4) {
        return Err(violation(format!(
            "{BYTES_TAG} must be padded to a multiple of 4 characters"
        )));
    }
    let padding = bytes.iter().rev().take_while(|byte| **byte == b'=').count();
    if padding > 2 {
        return Err(violation(format!("{BYTES_TAG} has more than two padding characters")));
    }
    let end = bytes.len() - padding;
    let mut decoded = Vec::with_capacity(end * 6 / 8);
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    for &character in &bytes[..end] {
        bits = ((bits << 6) | sextet(character)?) & 0xfff;
        bit_count += 6;
        if bit_count < 8 {
            continue;
        }
        bit_count -= 8;
        decoded.push(((bits >> bit_count) & 0xff) as u8);
    }
    if bits & ((1 << bit_count) - 1) != 0 {
        return Err(violation(format!(
            "{BYTES_TAG} has non-zero bits past the last whole byte, so it is not canonical base64"
        )));
    }
    Ok(decoded)
}

/// 编码一个整数：安全范围内直接用 JSON number，超出则打 `$bigint` 标签。
///
/// 与 `node-sqlite-engine.ts` 的 `normalizeValue` 同一档位——同一份仓储代码在
/// 两个后端上必须读到同样的类型，不能这边全是 bigint、那边全是 number。
pub fn encode_integer(value: i64) -> Value {
    // 用区间比较而不是 `abs()`：`i64::MIN.abs()` 会溢出 panic，而 rowid 是可以为负的。
    if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&value) {
        return Value::from(value);
    }
    encode_bigint(value)
}

/// 无条件编码成 `$bigint`；变更事件的 rowIds 用它（TS 侧断言 `typeof rowId === 'bigint'`）。
pub fn encode_bigint(value: i64) -> Value {
    tagged(BIGINT_TAG, Value::String(value.to_string()))
}

/// 编码一个 REAL。
///
/// JSON 没有 `Infinity` / `NaN` 的表示，而静默改写成 `null` 会让调用方读到一个
/// **不是他写进去的值**。这类值在这条传输上无法忠实搬运，因此显式报错。
pub fn encode_real(value: f64) -> HostResult<Value> {
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .ok_or_else(|| violation(format!("REAL value {value} cannot be carried over JSON")))
}

/// 编码一段字节，标准 base64。
pub fn encode_bytes(bytes: &[u8]) -> Value {
    tagged(BYTES_TAG, Value::String(encode_base64(bytes)))
}

/// 把 `$u8` 标签还原成字节，[`encode_bytes`] 的逆。
///
/// 与 [`decode_binding`] 分开：那边接受 `null` / 数字 / 字符串 / `number[]` 等一整套 SQLite
/// 绑定形状，而文件写入的 `chunk` 只有 `$u8` 一种合法写法。复用 `decode_binding` 会让一个
/// 写错成字符串的 chunk 变成「一段文本」被静默写进文件，而不是当场报协议违规。
pub fn decode_bytes(value: &Value) -> HostResult<Vec<u8>> {
    let text = value
        .as_object()
        .filter(|object| object.len() == 1)
        .and_then(|object| object.get(BYTES_TAG))
        .and_then(Value::as_str)
        .ok_or_else(|| violation(format!("expected a {BYTES_TAG} tagged base64 payload")))?;
    decode_base64(text)
}

/// 编码一个时间戳（epoch 毫秒）。
pub fn encode_date_ms(milliseconds: i64) -> Value {
    tagged(DATE_TAG, Value::from(milliseconds))
}

/// 把一个 SQLite 读出的值编码成 JSON 传输形状。
pub fn encode_sqlite_value(value: &rusqlite::types::Value) -> HostResult<Value> {
    match value {
        rusqlite::types::Value::Null => Ok(Value::Null),
        rusqlite::types::Value::Integer(integer) => Ok(encode_integer(*integer)),
        rusqlite::types::Value::Real(real) => encode_real(*real),
        rusqlite::types::Value::Text(text) => Ok(Value::String(text.clone())),
        rusqlite::types::Value::Blob(blob) => Ok(encode_bytes(blob)),
    }
}

fn decode_number_array(items: &[Value]) -> HostResult<Vec<u8>> {
    items
        .iter()
        .map(|item| {
            let byte = item.as_u64().filter(|value| *value <= 0xff);
            byte.map(|value| value as u8)
                .ok_or_else(|| violation("a number array binding must contain byte values in 0..=255"))
        })
        .collect()
}

fn decode_tagged_binding(object: &Map<String, Value>) -> HostResult<rusqlite::types::Value> {
    let (tag, payload) = object.iter().next().expect("caller checked the map has one entry");
    if tag == BIGINT_TAG {
        let text = payload
            .as_str()
            .ok_or_else(|| violation(format!("{BIGINT_TAG} must carry a decimal string")))?;
        let integer = text.parse::<i64>().map_err(|_| {
            violation(format!("{BIGINT_TAG} carried \"{text}\", which is not a 64 bit decimal integer"))
        })?;
        return Ok(rusqlite::types::Value::Integer(integer));
    }
    if tag == BYTES_TAG {
        let text = payload
            .as_str()
            .ok_or_else(|| violation(format!("{BYTES_TAG} must carry a base64 string")))?;
        return Ok(rusqlite::types::Value::Blob(decode_base64(text)?));
    }
    Err(violation(format!("{tag} is not a valid SQLite binding")))
}

fn is_tag_key(key: &str) -> bool {
    key == BIGINT_TAG || key == BYTES_TAG || key == DATE_TAG || key == ESCAPE_TAG
}

/// 把一个绑定参数从 JSON 传输形状还原成 SQLite 值。
///
/// 只接受协议允许的形状（见 `desktop-host-protocol.ts` 的 `isBindingValue`）：
/// `null` / number / string / `$bigint` / `$u8` / `number[]`。
/// `$date` 与 `$esc` 都不是合法绑定，这里一并按协议违规拒绝，而不是猜一个语义。
pub fn decode_binding(value: &Value) -> HostResult<rusqlite::types::Value> {
    match value {
        Value::Null => Ok(rusqlite::types::Value::Null),
        Value::String(text) => Ok(rusqlite::types::Value::Text(text.clone())),
        Value::Number(number) => decode_number_binding(number),
        // `number[]` 是 blob 的等价写法，与 `node-sqlite-engine.ts` 的 `toSupportedValue` 一致。
        Value::Array(items) => Ok(rusqlite::types::Value::Blob(decode_number_array(items)?)),
        Value::Object(object) if object.len() == 1 && object.keys().all(|key| is_tag_key(key)) => {
            decode_tagged_binding(object)
        }
        _ => Err(violation("binding is not a SQLite compatible value")),
    }
}

fn decode_number_binding(number: &serde_json::Number) -> HostResult<rusqlite::types::Value> {
    if let Some(integer) = number.as_i64() {
        return Ok(rusqlite::types::Value::Integer(integer));
    }
    number
        .as_f64()
        .map(rusqlite::types::Value::Real)
        .ok_or_else(|| violation(format!("binding number {number} is not representable")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 与 `desktop-json-codec.spec.ts` 的 base64 向量逐条对齐。
    #[test]
    fn encodes_bytes_as_standard_padded_base64() {
        assert_eq!(encode_bytes(&[]), json!({ "$u8": "" }));
        assert_eq!(encode_bytes(&[102]), json!({ "$u8": "Zg==" }));
        assert_eq!(encode_bytes(&[102, 111]), json!({ "$u8": "Zm8=" }));
        assert_eq!(encode_bytes(&[102, 111, 111]), json!({ "$u8": "Zm9v" }));
        assert_eq!(encode_bytes(&[251, 255, 190]), json!({ "$u8": "+/++" }));
    }

    #[test]
    fn round_trips_every_byte_value_through_base64() {
        let bytes: Vec<u8> = (0..=255).collect();
        let encoded = encode_bytes(&bytes);
        assert_eq!(decode_binding(&encoded).unwrap(), rusqlite::types::Value::Blob(bytes.clone()));
        assert_eq!(decode_bytes(&encoded).unwrap(), bytes);
    }

    /// 文件写入的 `chunk` 只有 `$u8` 一种合法写法。放行字符串或数组会让一个写错的 chunk
    /// 被静默当成内容写进用户的文件——而这类损坏在读回之前完全看不见。
    #[test]
    fn decode_bytes_only_accepts_the_tagged_shape() {
        for value in [
            json!("Zm9v"),
            json!([102, 111, 111]),
            json!(null),
            json!({ "$bigint": "1" }),
            json!({ "$u8": "Zm9v", "extra": 1 }),
            json!({ "$u8": 7 }),
        ] {
            let error = decode_bytes(&value).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {value}");
        }
    }

    /// `$u8` 载荷是用户的 blob。宽松解码会把截断当成一条更短的 blob 安静地收下，
    /// 等到它被读出来解析失败时现场早已不在——所以只认规范形式。
    /// 与 `desktop-json-codec.spec.ts` 的同名断言逐条对齐。
    #[test]
    fn only_accepts_canonical_base64() {
        let rejected = [
            // "Zm9vYmFy" 掉两个字符：宽松解码会还原成 4 字节，规范化后长度对不齐 4，直接拒。
            "Zm9vYm", "Zg=", "Zg===", "====",
            // `Zm9=` 与 `Zm8=` 解出同一串字节，只有后者是编码器会产出的写法。
            "Zm9=", "Zh==",
        ];
        for text in rejected {
            let error = decode_binding(&json!({ "$u8": text })).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {text:?}");
        }
    }

    #[test]
    fn keeps_accepting_every_canonical_padding_shape() {
        let accepted = [
            ("", vec![]),
            ("Zg==", vec![102]),
            ("Zm8=", vec![102, 111]),
            ("Zm9v", vec![102, 111, 111]),
            ("Zm9vYmFy", vec![102, 111, 111, 98, 97, 114]),
        ];
        for (text, expected) in accepted {
            let decoded = decode_binding(&json!({ "$u8": text })).unwrap();
            assert_eq!(decoded, rusqlite::types::Value::Blob(expected), "for {text:?}");
        }
    }

    /// 2^53 边界：JS 侧的 `Number` 到这里就开始丢位，因此必须走 `$bigint`。
    #[test]
    fn tags_integers_beyond_the_safe_range() {
        assert_eq!(encode_integer(42), json!(42));
        assert_eq!(encode_integer(MAX_SAFE_INTEGER), json!(MAX_SAFE_INTEGER));
        assert_eq!(encode_integer(-MAX_SAFE_INTEGER), json!(-MAX_SAFE_INTEGER));
        assert_eq!(
            encode_integer(MAX_SAFE_INTEGER + 2),
            json!({ "$bigint": "9007199254740993" })
        );
        assert_eq!(encode_bigint(1), json!({ "$bigint": "1" }));
        assert_eq!(encode_bigint(-1), json!({ "$bigint": "-1" }));
        assert_eq!(encode_bigint(0), json!({ "$bigint": "0" }));
    }

    #[test]
    fn tags_dates_as_epoch_milliseconds() {
        assert_eq!(encode_date_ms(7), json!({ "$date": 7 }));
    }

    #[test]
    fn refuses_to_carry_non_finite_reals_over_json() {
        assert_eq!(encode_real(1.5).unwrap(), json!(1.5));
        assert_eq!(
            encode_real(f64::INFINITY).unwrap_err().code,
            ErrorCode::ProtocolViolation
        );
        assert_eq!(encode_real(f64::NAN).unwrap_err().code, ErrorCode::ProtocolViolation);
    }

    #[test]
    fn encodes_sqlite_values_by_storage_class() {
        let cases = [
            (rusqlite::types::Value::Null, json!(null)),
            (rusqlite::types::Value::Integer(9_007_199_254_740_993), json!({ "$bigint": "9007199254740993" })),
            (rusqlite::types::Value::Real(-0.25), json!(-0.25)),
            (rusqlite::types::Value::Text("two".into()), json!("two")),
            (rusqlite::types::Value::Blob(vec![102, 111, 111]), json!({ "$u8": "Zm9v" })),
        ];
        for (value, expected) in cases {
            assert_eq!(encode_sqlite_value(&value).unwrap(), expected);
        }
    }

    #[test]
    fn decodes_the_binding_shapes_the_protocol_allows() {
        let cases = [
            (json!(null), rusqlite::types::Value::Null),
            (json!(42), rusqlite::types::Value::Integer(42)),
            (json!(1.5), rusqlite::types::Value::Real(1.5)),
            (json!("two"), rusqlite::types::Value::Text("two".into())),
            (json!({ "$bigint": "9007199254740993" }), rusqlite::types::Value::Integer(9_007_199_254_740_993)),
            (json!({ "$u8": "Zm9v" }), rusqlite::types::Value::Blob(vec![102, 111, 111])),
            (json!([102, 111, 111]), rusqlite::types::Value::Blob(vec![102, 111, 111])),
            (json!([]), rusqlite::types::Value::Blob(vec![])),
        ];
        for (value, expected) in cases {
            assert_eq!(decode_binding(&value).unwrap(), expected);
        }
    }

    /// 与 `desktop-json-codec.spec.ts` 的「拒绝畸形标签」一节对齐。
    #[test]
    fn rejects_malformed_tags_instead_of_guessing() {
        let malformed = [
            json!({ "$bigint": 5 }),
            json!({ "$bigint": "not a number" }),
            json!({ "$u8": 5 }),
            json!({ "$u8": "!!!!" }),
            // 4n+1 个有效字符：载荷被截断了。
            json!({ "$u8": "Zm9vZ" }),
            // `$date` 不是合法绑定，`$esc` 在 Rust 侧根本不解码（见模块文档）。
            json!({ "$date": 7 }),
            json!({ "$esc": { "$bigint": "1" } }),
            json!({ "unknown": 1 }),
            json!({ "$bigint": "1", "$u8": "" }),
            json!(true),
            json!([1, 999]),
            json!([1, "x"]),
        ];
        for value in malformed {
            let error = decode_binding(&value).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {value}");
        }
    }
}
