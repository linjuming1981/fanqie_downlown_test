use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use serde_json::{Value, json};

const AID_DEFAULT: &str = "1967";

#[derive(Deserialize)]
struct CommentStatsRequest {
    base_url: String,
    chapter_id: String,
    item_version: String,
    #[serde(default = "default_aid")]
    aid: String,
    install_id: String,
}

#[derive(Deserialize)]
struct CommentListRequest {
    base_url: String,
    chapter_id: String,
    #[serde(default = "default_aid")]
    aid: String,
    install_id: String,
    business_param: Value,
    comment_source: i32,
    comment_type: i32,
    count: usize,
    group_type: i32,
    sort: i32,
}

fn default_aid() -> String {
    AID_DEFAULT.to_string()
}

pub fn handle_comment_stats(payload: &[u8]) -> Result<Value, String> {
    let request: CommentStatsRequest =
        serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.base_url.is_empty() {
        return Err("comment stats url missing".to_string());
    }
    let client = build_client().map_err(|err| err.to_string())?;
    let url = format!("{}/{}/v1", request.base_url, request.chapter_id);
    let body = json!({ "item_version": request.item_version });
    let response = client
        .post(url)
        .query(&[
            ("aid", request.aid.as_str()),
            ("iid", request.install_id.as_str()),
        ])
        .json(&body)
        .send()
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .map_err(|err| err.to_string())?;
    Ok(response)
}

pub fn handle_comment_list(payload: &[u8]) -> Result<Value, String> {
    let request: CommentListRequest =
        serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.base_url.is_empty() {
        return Err("comment list url missing".to_string());
    }
    let client = build_client().map_err(|err| err.to_string())?;
    let url = format!("{}/{}/v1", request.base_url, request.chapter_id);
    let response = client
        .post(url)
        .query(&[
            ("aid", request.aid.as_str()),
            ("iid", request.install_id.as_str()),
        ])
        .json(&json!({
            "business_param": request.business_param,
            "comment_source": request.comment_source,
            "comment_type": request.comment_type,
            "count": request.count,
            "group_type": request.group_type,
            "sort": request.sort,
        }))
        .send()
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .map_err(|err| err.to_string())?;
    Ok(response)
}

fn build_client() -> Result<Client, reqwest::Error> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        ),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(12))
        .build()
}
