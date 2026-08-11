use std::collections::{HashMap, HashSet};
use std::env;
use std::error::Error;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use colored::*;
use gix::ObjectId;
use gix::bstr::ByteSlice;
use rayon::prelude::*;

// 需要统计的文件后缀，与 JS 版本保持一致
const TRACKED_EXTENSIONS: [&str; 16] = [
    ".js",
    ".mjs",
    ".jsx",
    ".ts",
    ".mts",
    ".tsx",
    ".rs",
    // 文档类
    ".md",
    ".mdx",
    ".css",
    ".scss",
    ".html",
    ".sh",
    "Dockerfile",
    ".json",
    ".yml",
];
// 仅统计 src 与 app 目录下的文件
const TRACKED_PATHS: [&str; 6] = [
    "apps/",
    "packages/",
    "modules/",
    "website/",
    "benchmarks/",
    "scripts/",
];
// 测试文件后缀列表，用于区分测试行数
const TEST_FILE_EXTENSIONS: [&str; 8] = [
    ".spec.js",
    ".spec.jsx",
    ".spec.ts",
    ".spec.tsx",
    ".test.js",
    ".test.jsx",
    ".test.ts",
    ".test.tsx",
];

const DOC_FILE_EXTENSIONS: [&str; 2] = [".md", ".mdx"];

/// 计算字符串的显示宽度（考虑emoji的4字节=2列的特殊情况）
/// emoji字符长度统计：
/// - emoji "📦", "🚀", "📄" 都是4字节UTF-8，但显示宽度只有2列
/// - format!("{:<width$}") 会根据字符长度padding，导致emoji后有额外空格
/// 通过补偿来修正显示宽度
fn display_width(s: &str) -> usize {
    let mut width = 0;
    for c in s.chars() {
        // 检查是否为emoji (U+1F000 到 U+1FFFF 范围)
        if c as u32 >= 0x1F000 && c as u32 <= 0x1FFFF {
            // emoji占2列，但.len()会计为4字节，需要补偿差2
            width += 2; // 实际显示宽度
        } else {
            width += 1;
        }
    }
    width
}

/// 渲染进度条
/// @param percent - 进度百分比 (0.0-1.0)
/// @returns 格式化的进度条字符串
fn render_progress_bar(percent: f64) -> String {
    const BAR_LENGTH: usize = 30;
    let filled_length = (BAR_LENGTH as f64 * percent).round() as usize;
    let empty_length = BAR_LENGTH.saturating_sub(filled_length);

    let filled_bar = "█".repeat(filled_length);
    let empty_bar = "░".repeat(empty_length);
    let percent_text = format!("{:>6.2}%", percent * 100.0);

    format!(
        "{}{}{}{} {}",
        "[".cyan(),
        filled_bar.green(),
        empty_bar.truecolor(128, 128, 128),
        "]".cyan(),
        percent_text.bold()
    )
}

#[derive(Debug, Clone)]
struct ProjectStats {
    author_lines: HashMap<String, u64>,
    author_test_lines: HashMap<String, u64>,
    author_comment_lines: HashMap<String, u64>,
    author_markdown_lines: HashMap<String, u64>,
}

impl ProjectStats {
    fn new() -> Self {
        Self {
            author_lines: HashMap::new(),
            author_test_lines: HashMap::new(),
            author_comment_lines: HashMap::new(),
            author_markdown_lines: HashMap::new(),
        }
    }

    fn merge(&mut self, other: Self) {
        merge_into(&mut self.author_lines, other.author_lines);
        merge_into(&mut self.author_test_lines, other.author_test_lines);
        merge_into(&mut self.author_comment_lines, other.author_comment_lines);
        merge_into(&mut self.author_markdown_lines, other.author_markdown_lines);
    }
}

fn main() {
    if let Err(err) = run() {
        eprintln!("Error running git stats: {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let start = Instant::now();

    // 动态获取项目分类，与 JS 版本保持一致
    let categories = build_categories()?;

    // 读取符合条件的所有文件
    let files = get_tracked_files()?;

    if files.is_empty() {
        println!("No tracked files found under target paths.");
        return Ok(());
    }

    let total = files.len();
    let progress = AtomicUsize::new(0);
    let thread_count = configured_thread_count(files.len());
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .build()?;

    // 打开一次仓库即可：ThreadSafeRepository 可跨线程共享 object database 与 packfile
    // 映射，每个 worker 再 to_thread_local() 拿到自己的缓存，避免 2489 次 git 进程启动。
    let repo = gix::discover(".")?.into_sync();
    let head_id = repo.to_thread_local().head_id()?.detach();

    // 工作区里被改动的文件必须回退到 `git blame` 子进程：gix 只能 blame 某个 commit，
    // 而 JS 版 blame 的是工作区内容，未提交的行会记到 "Not Committed Yet" 名下。
    let dirty = dirty_paths();
    let renamed = rename_destinations();

    // 使用固定大小的 Rayon 线程池并行处理每个文件。
    let project_stats_map = pool.install(|| {
        files
            .par_iter()
            .map_init(
                || BlameContext::new(repo.to_thread_local()),
                |ctx, file| {
                let project = get_project_from_path(file);
                let mut stats = ProjectStats::new();

                // 预分配容量以减少重新分配
                stats.author_lines.reserve(10);
                stats.author_test_lines.reserve(10);
                stats.author_comment_lines.reserve(10);
                stats.author_markdown_lines.reserve(10);

                process_file(
                    ctx,
                    head_id,
                    dirty.contains(file.as_str()),
                    renamed.contains(file.as_str()),
                    file,
                    &mut stats.author_lines,
                    &mut stats.author_test_lines,
                    &mut stats.author_comment_lines,
                    &mut stats.author_markdown_lines,
                );

                let processed = progress.fetch_add(1, Ordering::Relaxed) + 1;
                if processed % 25 == 0 || processed == total {
                    let percent = processed as f64 / total as f64;
                    eprint!("\rProcessing... {}", render_progress_bar(percent));
                }

                (project, stats)
                },
            )
            .fold(
                HashMap::new,
                |mut acc: HashMap<String, ProjectStats>, (project, stats)| {
                    acc.entry(project)
                        .or_insert_with(ProjectStats::new)
                        .merge(stats);
                    acc
                },
            )
            .reduce(HashMap::new, |mut acc, map| {
                for (project, stats) in map {
                    acc.entry(project)
                        .or_insert_with(ProjectStats::new)
                        .merge(stats);
                }
                acc
            })
    });

    // 确保显示 100% 进度并换行
    eprint!("\rProcessing... {}", render_progress_bar(1.0));
    eprintln!();

    print_all_stats(&project_stats_map, &categories);

    println!("use: {:.2?}", start.elapsed());

    Ok(())
}

fn configured_thread_count(file_count: usize) -> usize {
    // blame 现在跑在进程内，是纯 CPU 活，按核心数铺开即可（旧的 10 线程硬上限会浪费大核）
    let default_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(8);
    let requested = env::var("GIT_STATS_CONCURRENCY")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_count);
    requested.min(file_count.max(1))
}

fn get_tracked_files() -> Result<Vec<String>, Box<dyn Error>> {
    let output = Command::new("git").arg("ls-files").output()?;

    if !output.status.success() {
        return Err("git ls-files failed".into());
    }

    let stdout = String::from_utf8(output.stdout)?;
    let files = stdout
        .lines()
        .filter(|file| {
            TRACKED_EXTENSIONS.iter().any(|ext| file.ends_with(ext))
                && TRACKED_PATHS.iter().any(|path| file.contains(path))
        })
        .map(|file| file.to_owned())
        .collect();

    Ok(files)
}

/// 每个 rayon worker 持有一份：线程本地的 Repository（内部缓存不是 Sync 的），
/// 外加一张 commit -> 作者名 的缓存 —— 一个文件里成百上千行往往只来自少数几个 commit。
struct BlameContext {
    repo: gix::Repository,
    authors: HashMap<ObjectId, String>,
}

impl BlameContext {
    fn new(mut repo: gix::Repository) -> Self {
        // 解压过的 object 复用，避免同一个 commit 反复 zlib 解压
        repo.object_cache_size_if_unset(8 * 1024 * 1024);
        Self {
            repo,
            authors: HashMap::new(),
        }
    }

    /// 取 commit 的作者名（已归一化），命中缓存则直接返回。
    fn author_of(&mut self, commit: ObjectId) -> Option<&str> {
        if !self.authors.contains_key(&commit) {
            let name = self
                .repo
                .find_commit(commit)
                .ok()?
                .author()
                .ok()
                .map(|author| normalize_author_name(&author.name.to_str_lossy()))?;
            self.authors.insert(commit, name);
        }
        self.authors.get(&commit).map(String::as_str)
    }
}

/// 收集历史上所有「重命名产物」的路径。
///
/// blame 只有在文件历史跨过重命名时才需要开改名追踪，而开了就必须把候选上限放开
/// （见 blame_in_process 里的注释），代价很高。本仓库 2367 个文件里只有 346 个
/// 是重命名产物，所以先用一次 `git log` 把这批文件挑出来，其余走不带改名追踪的快路径。
///
/// 判据成立的原因：某个路径的历史若跨过重命名，那它自己必然是某次重命名的目标路径。
fn rename_destinations() -> HashSet<String> {
    // renameLimit=0 表示不限，避免 git 自己在大规模重构提交上放弃改名检测
    let Ok(output) = Command::new("git")
        .args([
            "-c",
            "diff.renameLimit=0",
            "log",
            "--name-status",
            "-M",
            "--diff-merges=first-parent",
            "--format=",
            "HEAD",
        ])
        .output()
    else {
        return HashSet::new();
    };

    let Ok(stdout) = String::from_utf8(output.stdout) else {
        return HashSet::new();
    };

    stdout
        .lines()
        .filter(|line| line.starts_with('R'))
        // `R100\t<旧路径>\t<新路径>`，取新路径
        .filter_map(|line| line.split('\t').nth(2))
        .map(str::to_owned)
        .collect()
}

/// 收集工作区中与 HEAD 有差异的路径（含暂存、未暂存与未跟踪）。
/// 只跑一次 `git status`，用来决定哪些文件必须走子进程 blame。
fn dirty_paths() -> HashSet<String> {
    let Ok(output) = Command::new("git")
        .args(["status", "--porcelain", "--untracked-files=all"])
        .output()
    else {
        return HashSet::new();
    };

    let Ok(stdout) = String::from_utf8(output.stdout) else {
        return HashSet::new();
    };

    let mut paths = HashSet::new();
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        // 重命名记为 `R  old -> new`，两侧都要算脏
        for path in line[3..].split(" -> ") {
            paths.insert(path.trim_matches('"').to_owned());
        }
    }
    paths
}

#[allow(clippy::too_many_arguments)]
fn process_file(
    ctx: &mut BlameContext,
    head_id: ObjectId,
    is_dirty: bool,
    was_renamed: bool,
    file: &str,
    code_lines: &mut HashMap<String, u64>,
    test_lines: &mut HashMap<String, u64>,
    comment_lines: &mut HashMap<String, u64>,
    doc_lines: &mut HashMap<String, u64>,
) {
    let is_md = is_markdown_file(file);
    let is_test = is_test_file(file);

    if !is_dirty
        && blame_in_process(
            ctx,
            head_id,
            was_renamed,
            file,
            code_lines,
            test_lines,
            comment_lines,
            doc_lines,
            is_md,
            is_test,
        )
    {
        return;
    }

    blame_via_subprocess(
        file,
        code_lines,
        test_lines,
        comment_lines,
        doc_lines,
        is_md,
        is_test,
    );
}

/// 进程内 blame：不 fork，直接读共享的 object database。返回 false 表示需要回退到子进程。
#[allow(clippy::too_many_arguments)]
fn blame_in_process(
    ctx: &mut BlameContext,
    head_id: ObjectId,
    was_renamed: bool,
    file: &str,
    code_lines: &mut HashMap<String, u64>,
    test_lines: &mut HashMap<String, u64>,
    comment_lines: &mut HashMap<String, u64>,
    doc_lines: &mut HashMap<String, u64>,
    is_md: bool,
    is_test: bool,
) -> bool {
    // git blame 默认会跨重命名追溯文件历史，gix 默认不会 —— 不开 rewrites 的话，
    // 被重命名过的文件会把全部行算给「改名的那次提交」，作者归属会明显跑偏。
    //
    // limit 必须设成 0（不限）：默认的 1000 是重命名候选对（新增 × 删除）的上限，
    // 本仓库有几次一次性移动 150~200 个文件的重构提交，轻松超过这个上限，
    // 一旦超限 gix 就放弃改名追踪，那些文件的历史会在改名处断掉。
    //
    // 改名追踪很贵（全量开启会让整轮统计从 3s 涨到 15s），所以只给真正跨过
    // 重命名的文件开，其余文件结果完全一致但快得多。
    let rewrites = was_renamed.then(|| gix::diff::Rewrites {
        limit: 0,
        ..Default::default()
    });
    let options = gix::repository::blame_file::Options {
        rewrites,
        ..Default::default()
    };
    let Ok(outcome) = ctx
        .repo
        .blame_file(file.as_bytes().as_bstr(), head_id, options)
    else {
        return false;
    };

    // outcome.blob 就是该文件在 HEAD 上的内容，按行切开供注释/代码判定使用
    let lines: Vec<&[u8]> = outcome.blob.split(|byte| *byte == b'\n').collect();

    for entry in &outcome.entries {
        let Some(author) = ctx.author_of(entry.commit_id) else {
            continue;
        };
        // author 借用自 ctx.authors，这里先拿到所属计数桶再累加
        let author = author.to_owned();

        for offset in 0..entry.len.get() {
            let Some(line) = lines.get((entry.start_in_blamed_file + offset) as usize) else {
                continue;
            };
            let line = String::from_utf8_lossy(line);
            count_line(
                &author,
                line.as_ref(),
                code_lines,
                test_lines,
                comment_lines,
                doc_lines,
                is_md,
                is_test,
            );
        }
    }

    true
}

/// 子进程 blame：工作区有改动的文件走这条路，保证未提交的行仍归到 "Not Committed Yet"。
fn blame_via_subprocess(
    file: &str,
    code_lines: &mut HashMap<String, u64>,
    test_lines: &mut HashMap<String, u64>,
    comment_lines: &mut HashMap<String, u64>,
    doc_lines: &mut HashMap<String, u64>,
    is_md: bool,
    is_test: bool,
) {
    // 使用精简 porcelain 输出统计每一行的作者
    let Ok(output) = Command::new("git")
        .args(["blame", "--porcelain", "--", file])
        .output()
    else {
        return;
    };

    if !output.status.success() {
        return;
    }

    let Ok(stdout) = String::from_utf8(output.stdout) else {
        return;
    };

    parse_blame_output(
        &stdout,
        code_lines,
        test_lines,
        comment_lines,
        doc_lines,
        is_md,
        is_test,
    );
}

/// 单行归类：Markdown 行 / 注释行 / 测试行 / 代码行，两条 blame 路径共用。
#[allow(clippy::too_many_arguments)]
fn count_line(
    author: &str,
    line: &str,
    code_lines: &mut HashMap<String, u64>,
    test_lines: &mut HashMap<String, u64>,
    comment_lines: &mut HashMap<String, u64>,
    doc_lines: &mut HashMap<String, u64>,
    is_md: bool,
    is_test: bool,
) {
    if is_md {
        if !line.trim().is_empty() {
            *doc_lines.entry(author.to_owned()).or_insert(0) += 1;
        }
    } else if is_comment_line(line) {
        *comment_lines.entry(author.to_owned()).or_insert(0) += 1;
    } else if is_test {
        *test_lines.entry(author.to_owned()).or_insert(0) += 1;
    } else {
        *code_lines.entry(author.to_owned()).or_insert(0) += 1;
    }
}

fn parse_blame_output(
    stdout: &str,
    code_lines: &mut HashMap<String, u64>,
    test_lines: &mut HashMap<String, u64>,
    comment_lines: &mut HashMap<String, u64>,
    doc_lines: &mut HashMap<String, u64>,
    is_md: bool,
    is_test: bool,
) {
    let mut commit_authors = HashMap::<String, String>::new();
    let mut current_commit: Option<&str> = None;
    let mut current_author: Option<String> = None;

    // porcelain 只在 commit 首次出现时输出作者信息，后续行从缓存恢复作者。
    for line in stdout.lines() {
        if let Some(commit) = blame_header_commit(line) {
            current_commit = Some(commit);
            current_author = commit_authors.get(commit).cloned();
            continue;
        }
        if let Some(author) = line.strip_prefix("author ") {
            let normalized = normalize_author_name(author);
            if let Some(commit) = current_commit {
                commit_authors.insert(commit.to_owned(), normalized.clone());
            }
            current_author = Some(normalized);
            continue;
        }
        let Some(actual_line) = line.strip_prefix('\t') else {
            continue;
        };
        let Some(author) = current_author.as_deref() else {
            continue;
        };

        count_line(
            author,
            actual_line,
            code_lines,
            test_lines,
            comment_lines,
            doc_lines,
            is_md,
            is_test,
        );
    }
}

fn blame_header_commit(line: &str) -> Option<&str> {
    let mut fields = line.split_ascii_whitespace();
    let commit = fields.next()?;
    let is_hash = (commit.len() == 40 && commit.bytes().all(|byte| byte.is_ascii_hexdigit()))
        || (commit.len() == 41
            && commit.starts_with('^')
            && commit[1..].bytes().all(|byte| byte.is_ascii_hexdigit()));
    if !is_hash || fields.next()?.parse::<u64>().is_err() || fields.next()?.parse::<u64>().is_err()
    {
        return None;
    }
    Some(commit)
}

fn is_comment_line(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }

    // 单行注释: //, #
    if trimmed.starts_with("//") || trimmed.starts_with('#') {
        return true;
    }

    // 块注释: /*, */, *, <!-- -->
    if trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.ends_with("*/")
        || trimmed.starts_with("<!--")
        || trimmed.ends_with("-->")
    {
        return true;
    }

    false
}

fn is_test_file(path: &str) -> bool {
    TEST_FILE_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

fn is_markdown_file(path: &str) -> bool {
    DOC_FILE_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

fn normalize_author_name(name: &str) -> String {
    let trimmed = name
        .trim()
        .trim_matches('"')
        .trim_matches('“')
        .trim_matches('”');
    match trimmed {
        "Jimmy" | "Jimmy Liu" => "Jimmy".to_owned(),
        other => other.to_owned(),
    }
}

fn get_project_from_path(file_path: &str) -> String {
    if file_path.starts_with("website/") {
        "website".to_string()
    } else if file_path.starts_with("benchmarks/") {
        "benchmarks".to_string()
    } else if file_path.starts_with("scripts/") {
        "scripts".to_string()
    } else {
        // 对于 apps/, packages/, modules/ 提取第二部分作为项目名
        let parts: Vec<&str> = file_path.split('/').collect();
        if parts.len() > 1 {
            parts[1].to_string()
        } else {
            "others".to_string()
        }
    }
}

fn merge_into(target: &mut HashMap<String, u64>, source: HashMap<String, u64>) {
    for (author, lines) in source {
        *target.entry(author).or_insert(0) += lines;
    }
}

fn format_number(num: u64) -> String {
    let s = num.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push(',');
        }
        result.push(c);
    }
    result.chars().rev().collect()
}

/// 获取指定目录下的所有一级子文件夹名称
fn get_subfolders(dir: &str) -> Vec<String> {
    let path = Path::new(dir);
    if !path.exists() {
        return Vec::new();
    }

    fs::read_dir(path)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|entry| {
                    let entry = entry.ok()?;
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name()?.to_str()?.to_string();
                        if !name.starts_with('.') {
                            Some(name)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// 构建分类映射，与 JS 版本保持一致
fn build_categories() -> Result<HashMap<String, Vec<String>>, Box<dyn Error>> {
    let mut categories = HashMap::new();

    categories.insert("apps".to_string(), get_subfolders("apps"));
    categories.insert("packages".to_string(), get_subfolders("packages"));
    categories.insert("modules".to_string(), get_subfolders("modules"));
    categories.insert(
        "others".to_string(),
        vec![
            "website".to_string(),
            "benchmarks".to_string(),
            "scripts".to_string(),
        ],
    );

    Ok(categories)
}

/// 根据项目名称和分类映射确定分类
fn get_category_for_project(project: &str, categories: &HashMap<String, Vec<String>>) -> String {
    for (category, projects) in categories {
        if projects
            .iter()
            .any(|p| p == project || project.starts_with(&format!("{}/", p)))
        {
            return category.clone();
        }
    }
    "others".to_string()
}

fn print_all_stats(
    project_stats_map: &HashMap<String, ProjectStats>,
    categories: &HashMap<String, Vec<String>>,
) {
    print_project_stats(project_stats_map, categories);
    print_author_stats(project_stats_map);
}

fn print_project_stats(
    project_stats_map: &HashMap<String, ProjectStats>,
    categories: &HashMap<String, Vec<String>>,
) {
    #[derive(Debug, Clone)]
    struct ProjectRow {
        project: String,
        code: u64,
        test: u64,
        comment: u64,
        doc: u64,
        all: u64,
        category: String,
    }

    // 对项目进行分类和排序
    let mut projects: Vec<ProjectRow> = project_stats_map
        .iter()
        .map(|(project, stats)| {
            let code: u64 = stats.author_lines.values().sum();
            let test: u64 = stats.author_test_lines.values().sum();
            let comment: u64 = stats.author_comment_lines.values().sum();
            let doc: u64 = stats.author_markdown_lines.values().sum();
            let all = code + test + comment + doc;

            let category = get_category_for_project(project, categories);

            ProjectRow {
                project: project.clone(),
                code,
                test,
                comment,
                doc,
                all,
                category,
            }
        })
        .collect();

    projects.sort_by(|a, b| {
        let order = |cat: &str| match cat {
            "apps" => 0,
            "packages" => 1,
            "modules" => 2,
            "others" => 3,
            _ => 4,
        };
        match order(&a.category).cmp(&order(&b.category)) {
            std::cmp::Ordering::Equal => a.project.cmp(&b.project),
            other => other,
        }
    });

    // 计算总数和分类统计
    let total_code: u64 = projects.iter().map(|p| p.code).sum();
    let total_test: u64 = projects.iter().map(|p| p.test).sum();
    let total_comment: u64 = projects.iter().map(|p| p.comment).sum();
    let total_doc: u64 = projects.iter().map(|p| p.doc).sum();
    let total_all = total_code + total_test + total_comment + total_doc;

    let mut category_stats: HashMap<&str, (u64, u64, u64, u64, u64)> = HashMap::new();
    for row in &projects {
        let entry = category_stats
            .entry(row.category.as_str())
            .or_insert((0, 0, 0, 0, 0));
        entry.0 += row.code;
        entry.1 += row.test;
        entry.2 += row.comment;
        entry.3 += row.doc;
        entry.4 += row.all;
    }

    // 计算列宽
    let headers = ["Project", "Code", "Test", "Comment", "Doc", "All", "%"];

    // 预先计算所有百分比字符串以准确获得宽度
    let percent_strings: Vec<String> = projects
        .iter()
        .map(|p| format!("{:.1}%", (p.all as f64 / total_all as f64) * 100.0))
        .collect();

    // 预先计算category titles
    let category_titles: HashMap<&str, String> = {
        let mut m = HashMap::new();
        for cat in ["packages", "apps", "other"] {
            let icon = match cat {
                "packages" => "📦",
                "apps" => "🚀",
                "other" => "📄",
                _ => "",
            };
            m.insert(cat, format!("{} {}", icon, cat.to_uppercase()));
        }
        m
    };

    let col_widths = [
        std::cmp::max(
            "Project".len(),
            std::cmp::max(
                std::cmp::max(
                    projects.iter().map(|p| p.project.len()).max().unwrap_or(0),
                    "TOTAL".len(),
                ),
                // 对category_titles使用display_width来补偿emoji的宽度
                category_titles
                    .values()
                    .map(|t| display_width(t))
                    .max()
                    .unwrap_or(0),
            ),
        ),
        std::cmp::max("Code".len(), format_number(total_code).len()),
        std::cmp::max("Test".len(), format_number(total_test).len()),
        std::cmp::max("Comment".len(), format_number(total_comment).len()),
        std::cmp::max("Doc".len(), format_number(total_doc).len()),
        std::cmp::max("All".len(), format_number(total_all).len()),
        std::cmp::max(
            "%".len(),
            std::cmp::max(
                percent_strings.iter().map(|s| s.len()).max().unwrap_or(0),
                "100.0%".len(),
            ),
        ),
    ];

    let table_width = col_widths.iter().sum::<usize>() + col_widths.len() * 3 - 1;

    let title = "Statistics by Project";
    println!();
    println!("┌{}┐", "─".repeat(table_width));

    let title_len = title.len();
    let padding_total = table_width.saturating_sub(title_len);
    let padding_left = padding_total / 2;
    let padding_right = padding_total - padding_left;

    println!(
        "│{}{}{}│",
        " ".repeat(padding_left),
        title.bright_cyan().bold(),
        " ".repeat(padding_right)
    );
    println!("├{}┤", "─".repeat(table_width));

    // 打印表头
    let header_row = format!(
        "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
        headers[0].bright_white().bold(),
        headers[1].bright_white().bold(),
        headers[2].bright_white().bold(),
        headers[3].bright_white().bold(),
        headers[4].bright_white().bold(),
        headers[5].bright_white().bold(),
        headers[6].bright_white().bold(),
        w0 = col_widths[0],
        w1 = col_widths[1],
        w2 = col_widths[2],
        w3 = col_widths[3],
        w4 = col_widths[4],
        w5 = col_widths[5],
        w6 = col_widths[6],
    );
    println!("{}", header_row);
    println!(
        "├{}┤",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┼")
    );

    let mut current_category = "";
    for row in &projects {
        if row.category != current_category {
            if !current_category.is_empty() {
                println!(
                    "├{}┤",
                    col_widths
                        .iter()
                        .map(|w| "─".repeat(w + 2))
                        .collect::<Vec<_>>()
                        .join("┼")
                );
            }
            current_category = &row.category;

            let (cat_code, cat_test, cat_comment, cat_doc, cat_all) =
                category_stats.get(current_category).unwrap();
            let cat_percent = (*cat_all as f64 / total_all as f64) * 100.0;

            let icon = match current_category {
                "apps" => "🚀",
                "packages" => "📦",
                "modules" => "🧩",
                "others" => "📄",
                _ => "",
            };

            // emoji占用2个显示位但4字节，需要用display_width正确计算宽度
            let category_title = format!("{} {}", icon, current_category.to_uppercase());
            // 计算需要补偿的空格数（因为emoji的字节/显示宽度差异）
            let title_display_width = display_width(&category_title);
            let padding_spaces = if title_display_width < col_widths[0] {
                " ".repeat(col_widths[0] - title_display_width)
            } else {
                String::new()
            };

            let cat_code_fmt = format_number(*cat_code);
            let cat_test_fmt = format_number(*cat_test);
            let cat_comment_fmt = format_number(*cat_comment);
            let cat_doc_fmt = format_number(*cat_doc);
            let cat_all_fmt = format_number(*cat_all);

            println!(
                "│ {}{} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
                category_title.yellow().bold(),
                padding_spaces,
                cat_code_fmt.green(),
                cat_test_fmt.blue(),
                cat_comment_fmt.bright_black(),
                cat_doc_fmt.cyan(),
                cat_all_fmt.magenta(),
                format!("{:.1}%", cat_percent).yellow(),
                w1 = col_widths[1],
                w2 = col_widths[2],
                w3 = col_widths[3],
                w4 = col_widths[4],
                w5 = col_widths[5],
                w6 = col_widths[6],
            );
            println!(
                "├{}┤",
                col_widths
                    .iter()
                    .map(|w| "─".repeat(w + 2))
                    .collect::<Vec<_>>()
                    .join("┼")
            );
        }

        let percent = (row.all as f64 / total_all as f64) * 100.0;
        let code_fmt = format_number(row.code);
        let test_fmt = format_number(row.test);
        let comment_fmt = format_number(row.comment);
        let doc_fmt = format_number(row.doc);
        let all_fmt = format_number(row.all);

        println!(
            "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
            row.project,
            code_fmt.green(),
            test_fmt.blue(),
            comment_fmt.bright_black(),
            doc_fmt.cyan(),
            all_fmt.magenta(),
            format!("{:.1}%", percent).yellow(),
            w0 = col_widths[0],
            w1 = col_widths[1],
            w2 = col_widths[2],
            w3 = col_widths[3],
            w4 = col_widths[4],
            w5 = col_widths[5],
            w6 = col_widths[6],
        );
    }

    println!(
        "├{}┤",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┼")
    );
    let total_code_fmt = format_number(total_code);
    let total_test_fmt = format_number(total_test);
    let total_comment_fmt = format_number(total_comment);
    let total_doc_fmt = format_number(total_doc);
    let total_all_fmt = format_number(total_all);

    println!(
        "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
        "TOTAL".bright_white().bold(),
        total_code_fmt.bright_white().bold(),
        total_test_fmt.bright_white().bold(),
        total_comment_fmt.bright_white().bold(),
        total_doc_fmt.bright_white().bold(),
        total_all_fmt.bright_white().bold(),
        "100.0%".bright_white().bold(),
        w0 = col_widths[0],
        w1 = col_widths[1],
        w2 = col_widths[2],
        w3 = col_widths[3],
        w4 = col_widths[4],
        w5 = col_widths[5],
        w6 = col_widths[6],
    );
    println!(
        "└{}┘",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┴")
    );
}

fn print_author_stats(project_stats_map: &HashMap<String, ProjectStats>) {
    // 合并所有作者的统计
    let mut author_stats: HashMap<String, (u64, u64, u64, u64)> = HashMap::new();

    for stats in project_stats_map.values() {
        let mut all_authors = std::collections::BTreeSet::new();
        all_authors.extend(stats.author_lines.keys().cloned());
        all_authors.extend(stats.author_test_lines.keys().cloned());
        all_authors.extend(stats.author_comment_lines.keys().cloned());
        all_authors.extend(stats.author_markdown_lines.keys().cloned());

        for author in all_authors {
            let entry = author_stats.entry(author.clone()).or_insert((0, 0, 0, 0));
            entry.0 += stats.author_lines.get(&author).copied().unwrap_or(0);
            entry.1 += stats.author_test_lines.get(&author).copied().unwrap_or(0);
            entry.2 += stats
                .author_comment_lines
                .get(&author)
                .copied()
                .unwrap_or(0);
            entry.3 += stats
                .author_markdown_lines
                .get(&author)
                .copied()
                .unwrap_or(0);
        }
    }

    let mut authors: Vec<_> = author_stats.iter().collect();
    authors.sort_by(|a, b| {
        let a_all = a.1 .0 + a.1 .1 + a.1 .2 + a.1 .3;
        let b_all = b.1 .0 + b.1 .1 + b.1 .2 + b.1 .3;
        b_all.cmp(&a_all)
    });

    let total_code: u64 = author_stats.values().map(|v| v.0).sum();
    let total_test: u64 = author_stats.values().map(|v| v.1).sum();
    let total_comment: u64 = author_stats.values().map(|v| v.2).sum();
    let total_doc: u64 = author_stats.values().map(|v| v.3).sum();
    let total_all = total_code + total_test + total_comment + total_doc;

    // 计算列宽
    let headers = ["Author", "Code", "Test", "Comment", "Doc", "All", "%"];

    // 预先计算所有百分比字符串以准确获得宽度
    let percent_strings: Vec<String> = authors
        .iter()
        .map(|a| {
            let all = a.1 .0 + a.1 .1 + a.1 .2 + a.1 .3;
            format!("{:.1}%", (all as f64 / total_all as f64) * 100.0)
        })
        .collect();

    let col_widths = [
        std::cmp::max(
            "Author".len(),
            std::cmp::max(
                authors.iter().map(|a| a.0.len()).max().unwrap_or(0),
                "TOTAL".len(),
            ),
        ),
        std::cmp::max("Code".len(), format_number(total_code).len()),
        std::cmp::max("Test".len(), format_number(total_test).len()),
        std::cmp::max("Comment".len(), format_number(total_comment).len()),
        std::cmp::max("Doc".len(), format_number(total_doc).len()),
        std::cmp::max("All".len(), format_number(total_all).len()),
        std::cmp::max(
            "%".len(),
            std::cmp::max(
                percent_strings.iter().map(|s| s.len()).max().unwrap_or(0),
                "100.0%".len(),
            ),
        ),
    ];

    let table_width = col_widths.iter().sum::<usize>() + col_widths.len() * 3 - 1;

    let title = "Statistics by Author";
    println!();
    println!("┌{}┐", "─".repeat(table_width));

    let title_len = title.len();
    let padding_total = table_width.saturating_sub(title_len);
    let padding_left = padding_total / 2;
    let padding_right = padding_total - padding_left;

    println!(
        "│{}{}{}│",
        " ".repeat(padding_left),
        title.bright_cyan().bold(),
        " ".repeat(padding_right)
    );
    println!("├{}┤", "─".repeat(table_width));

    // 打印表头
    let header_row = format!(
        "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
        headers[0].bright_white().bold(),
        headers[1].bright_white().bold(),
        headers[2].bright_white().bold(),
        headers[3].bright_white().bold(),
        headers[4].bright_white().bold(),
        headers[5].bright_white().bold(),
        headers[6].bright_white().bold(),
        w0 = col_widths[0],
        w1 = col_widths[1],
        w2 = col_widths[2],
        w3 = col_widths[3],
        w4 = col_widths[4],
        w5 = col_widths[5],
        w6 = col_widths[6],
    );
    println!("{}", header_row);
    println!(
        "├{}┤",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┼")
    );

    for (author, (code, test, comment, doc)) in authors {
        let all = code + test + comment + doc;
        let percent = (all as f64 / total_all as f64) * 100.0;

        let code_fmt = format_number(*code);
        let test_fmt = format_number(*test);
        let comment_fmt = format_number(*comment);
        let doc_fmt = format_number(*doc);
        let all_fmt = format_number(all);

        println!(
            "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
            author,
            code_fmt.green(),
            test_fmt.blue(),
            comment_fmt.bright_black(),
            doc_fmt.cyan(),
            all_fmt.magenta(),
            format!("{:.1}%", percent).yellow(),
            w0 = col_widths[0],
            w1 = col_widths[1],
            w2 = col_widths[2],
            w3 = col_widths[3],
            w4 = col_widths[4],
            w5 = col_widths[5],
            w6 = col_widths[6],
        );
    }

    println!(
        "├{}┤",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┼")
    );
    let total_code_fmt = format_number(total_code);
    let total_test_fmt = format_number(total_test);
    let total_comment_fmt = format_number(total_comment);
    let total_doc_fmt = format_number(total_doc);
    let total_all_fmt = format_number(total_all);

    println!(
        "│ {:<w0$} │ {:>w1$} │ {:>w2$} │ {:>w3$} │ {:>w4$} │ {:>w5$} │ {:>w6$} │",
        "TOTAL".bright_white().bold(),
        total_code_fmt.bright_white().bold(),
        total_test_fmt.bright_white().bold(),
        total_comment_fmt.bright_white().bold(),
        total_doc_fmt.bright_white().bold(),
        total_all_fmt.bright_white().bold(),
        "100.0%".bright_white().bold(),
        w0 = col_widths[0],
        w1 = col_widths[1],
        w2 = col_widths[2],
        w3 = col_widths[3],
        w4 = col_widths[4],
        w5 = col_widths[5],
        w6 = col_widths[6],
    );
    println!(
        "└{}┘",
        col_widths
            .iter()
            .map(|w| "─".repeat(w + 2))
            .collect::<Vec<_>>()
            .join("┴")
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_repeated_commit_without_repeated_author_metadata() {
        let commit = "0123456789abcdef0123456789abcdef01234567";
        let blame = format!(
            "{commit} 1 1 1\nauthor Jimmy Liu\n\tconst value = 1;\n{commit} 2 2\n\t// comment\n"
        );
        let mut code = HashMap::new();
        let mut test = HashMap::new();
        let mut comments = HashMap::new();
        let mut docs = HashMap::new();

        parse_blame_output(
            &blame,
            &mut code,
            &mut test,
            &mut comments,
            &mut docs,
            false,
            false,
        );

        assert_eq!(code.get("Jimmy"), Some(&1));
        assert_eq!(comments.get("Jimmy"), Some(&1));
    }

    #[test]
    fn keeps_test_and_markdown_classification() {
        let commit = "fedcba9876543210fedcba9876543210fedcba98";
        let blame = format!("{commit} 1 1 1\nauthor Alice\n\texpect(true);\n");
        let mut code = HashMap::new();
        let mut test = HashMap::new();
        let mut comments = HashMap::new();
        let mut docs = HashMap::new();

        parse_blame_output(
            &blame,
            &mut code,
            &mut test,
            &mut comments,
            &mut docs,
            false,
            true,
        );
        assert_eq!(test.get("Alice"), Some(&1));

        parse_blame_output(
            &format!("{commit} 1 1 1\nauthor Alice\n\t# Title\n\t\n"),
            &mut code,
            &mut test,
            &mut comments,
            &mut docs,
            true,
            false,
        );
        assert_eq!(docs.get("Alice"), Some(&1));
    }

    #[test]
    fn accepts_original_and_boundary_commit_headers() {
        assert_eq!(
            blame_header_commit("0123456789abcdef0123456789abcdef01234567 1 1"),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
        assert_eq!(
            blame_header_commit("^0123456789abcdef0123456789abcdef01234567 1 1"),
            Some("^0123456789abcdef0123456789abcdef01234567")
        );
        assert_eq!(blame_header_commit("author Alice"), None);
    }
}
