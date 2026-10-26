use serde_json::Value;
use std::io::Write;
use std::time::Instant;
use tauri::Manager;

pub struct ProbeTrace(pub Instant);

#[derive(Default)]
pub struct Event<'a> {
    pub stage: &'static str,
    pub sender: Option<&'a str>,
    pub target: Option<&'a str>,
    pub frame: Option<&'a str>,
    pub emitted: Option<bool>,
}

pub fn emit(app: &tauri::AppHandle, event: Event<'_>) {
    let elapsed = app
        .try_state::<ProbeTrace>()
        .map(|trace| trace.0.elapsed().as_millis());
    if let Some(line) = format_event(elapsed, event) {
        let _ = writeln!(std::io::stderr(), "[rxdb-devtools-probe] {line}");
    }
}

fn format_event(elapsed: Option<u128>, event: Event<'_>) -> Option<String> {
    let elapsed = elapsed?;
    let frame: Option<Value> = event.frame.and_then(|raw| serde_json::from_str(raw).ok());
    let protocol = frame
        .as_ref()
        .and_then(|value| value.get("protocol")?.as_u64())
        .filter(|value| *value == 1 || *value == 2);
    let frame_type = frame.as_ref().and_then(|value| value.get("type")?.as_str());
    Some(
        serde_json::json!({
            "elapsedMs": elapsed,
            "stage": event.stage,
            "sender": event.sender.map(window_label),
            "target": event.target.map(window_label),
            "protocol": protocol,
            "type": event.frame.map(|_| frame_name(frame_type)),
            "emitted": event.emitted,
        })
        .to_string(),
    )
}

fn window_label(label: &str) -> &str {
    match label {
        "main" => "main",
        "rxdb-devtools" => "rxdb-devtools",
        _ => "other",
    }
}

fn frame_name(name: Option<&str>) -> &'static str {
    match name {
        Some("PROTOCOL_HELLO") => "PROTOCOL_HELLO",
        Some("HANDSHAKE") => "HANDSHAKE",
        Some("HANDSHAKE_ACK") => "HANDSHAKE_ACK",
        Some("GET_BRANCHES") => "GET_BRANCHES",
        Some("INSPECT_DB") => "INSPECT_DB",
        Some("REQUEST") => "REQUEST",
        Some("RESPONSE") => "RESPONSE",
        Some("ERROR") => "ERROR",
        Some("PING") => "PING",
        Some("PONG") => "PONG",
        Some("DISCONNECT") => "DISCONNECT",
        Some("EVENT") => "EVENT",
        Some("TRANSFER_START") => "TRANSFER_START",
        Some("TRANSFER_CHUNK") => "TRANSFER_CHUNK",
        Some("TRANSFER_COMPLETE") => "TRANSFER_COMPLETE",
        Some("TRANSFER_CANCEL") => "TRANSFER_CANCEL",
        _ => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_probe_outputs_nothing() {
        assert!(format_event(
            None,
            Event {
                stage: "relay-received",
                frame: Some("private"),
                ..Event::default()
            }
        )
        .is_none());
    }

    #[test]
    fn frame_trace_contains_only_allowed_metadata() {
        let frame = r#"{"type":"PROTOCOL_HELLO","protocol":2,"sessionId":"private-session","payload":{"path":"/private/file","content":"private-content"}}"#;
        let line = format_event(
            Some(15),
            Event {
                stage: "relay-received",
                sender: Some("rxdb-devtools"),
                target: Some("main"),
                frame: Some(frame),
                ..Event::default()
            },
        )
        .unwrap();
        let value: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["elapsedMs"], 15);
        assert_eq!(value["type"], "PROTOCOL_HELLO");
        assert_eq!(value["protocol"], 2);
        assert_eq!(value["sender"], "rxdb-devtools");
        assert_eq!(value["target"], "main");
        assert!(!line.contains("private"));
        assert!(!line.contains("payload"));
        assert!(!line.contains("session"));
        assert!(!line.contains("path"));
    }

    #[test]
    fn untrusted_type_and_window_labels_are_not_copied_to_logs() {
        let line = format_event(
            Some(20),
            Event {
                stage: "relay-emitted",
                sender: Some("private-window"),
                frame: Some(r#"{"type":"private-type","protocol":999,"payload":"private-data"}"#),
                emitted: Some(false),
                ..Event::default()
            },
        )
        .unwrap();
        let value: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["type"], "other");
        assert_eq!(value["sender"], "other");
        assert!(value["protocol"].is_null());
        assert_eq!(value["emitted"], false);
        assert!(!line.contains("private"));
    }

    #[test]
    fn load_trace_has_no_url_or_frame_content() {
        let value: Value = serde_json::from_str(
            &format_event(
                Some(5),
                Event {
                    stage: "page-load-finished",
                    sender: Some("main"),
                    ..Event::default()
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(value["stage"], "page-load-finished");
        assert!(value.get("url").is_none());
        assert!(value["type"].is_null());
    }
}
