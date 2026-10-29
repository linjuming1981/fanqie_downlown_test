mod iid;
mod directory;
mod media;
mod reviews;
mod search;
mod signed_session;
mod version;

use serde_json::Value;

use crate::api::iid::{handle_activate, handle_register};
use crate::api::directory::handle_directory_detail;
use crate::api::media::handle_media_fetch;
use crate::api::reviews::{handle_comment_list, handle_comment_stats};
use crate::api::search::handle_search_books;
use crate::api::signed_session::{handle_batch_full, handle_batch_request, handle_register_key};
use crate::api::version::handle_version_fetch_filename;

pub fn handle_call(op: &str, payload: &[u8]) -> Result<Value, String> {
    match op {
        "iid_register" => handle_register(payload),
        "iid_activate" => handle_activate(payload),
        "book_directory_detail" => handle_directory_detail(payload),
        "review_comment_stats" => handle_comment_stats(payload),
        "review_comment_list" => handle_comment_list(payload),
        "media_fetch" => handle_media_fetch(payload),
        "signed_session_register_key" => handle_register_key(payload),
        "signed_session_batch_full" => handle_batch_full(payload),
        "signed_session_batch_request" => handle_batch_request(payload),
        "version_fetch_filename" => handle_version_fetch_filename(payload),
        "search_books" => handle_search_books(payload),
        _ => Err(format!("unknown core operation: {}", op)),
    }
}
