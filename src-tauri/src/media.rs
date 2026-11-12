use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static IMAGE_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Standard Base64 decoding (supports standard `+/` and URL-safe `-_` alphabets, ignoring whitespace).
pub fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut cleaned = Vec::with_capacity(input.len());
    for b in input.bytes() {
        if b.is_ascii_whitespace() || b == b'=' {
            continue;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return Err(format!("Invalid base64 character byte: {b}")),
        };
        cleaned.push(val);
    }

    let mut out = Vec::with_capacity((cleaned.len() * 3) / 4);
    for chunk in cleaned.chunks(4) {
        match chunk.len() {
            4 => {
                out.push((chunk[0] << 2) | (chunk[1] >> 4));
                out.push((chunk[1] << 4) | (chunk[2] >> 2));
                out.push((chunk[2] << 6) | chunk[3]);
            }
            3 => {
                out.push((chunk[0] << 2) | (chunk[1] >> 4));
                out.push((chunk[1] << 4) | (chunk[2] >> 2));
            }
            2 => {
                out.push((chunk[0] << 2) | (chunk[1] >> 4));
            }
            1 => {
                return Err("Invalid base64 length (single trailing sextet)".to_string());
            }
            _ => {}
        }
    }

    Ok(out)
}

/// Standard Base64 encoding for data URI fallbacks.
pub fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((bytes.len() + 2) / 3) * 4);

    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }

    out
}

/// Infers an image file extension (`png`, `jpg`, `gif`, `webp`, `svg`, `bmp`) from magic bytes or a hint.
pub fn infer_image_extension(bytes: &[u8], hint: Option<&str>) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return "png";
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "jpg";
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "gif";
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "webp";
    }
    if bytes.starts_with(b"BM") {
        return "bmp";
    }
    let head_str = std::str::from_utf8(&bytes[..bytes.len().min(256)]).unwrap_or("");
    if head_str.trim_start().starts_with("<svg") || head_str.contains("<svg") {
        return "svg";
    }

    if let Some(h) = hint {
        let lower = h.trim().to_lowercase();
        if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower == "jpg" || lower == "jpeg"
        {
            return "jpg";
        }
        if lower.ends_with(".gif") || lower == "gif" {
            return "gif";
        }
        if lower.ends_with(".webp") || lower == "webp" {
            return "webp";
        }
        if lower.ends_with(".svg") || lower.contains("svg") {
            return "svg";
        }
        if lower.ends_with(".bmp") || lower == "bmp" {
            return "bmp";
        }
    }

    "png"
}

/// Maps a file extension to an HTTP `Content-Type` header value.
pub fn mime_type_for_extension(ext: &str) -> &'static str {
    match ext.trim().to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

fn sanitize_stem(raw: &str) -> String {
    let stem = Path::new(raw)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(raw);
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed.chars().take(36).collect()
    }
}

/// Percent-decodes URL paths like `%20` or `%2F`.
pub fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let raw = input.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let (Some(h), Some(l)) = (
                (raw[i + 1] as char).to_digit(16),
                (raw[i + 2] as char).to_digit(16),
            ) {
                bytes.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        bytes.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

/// Saves an image payload (either a local file path, a `data:image/...;base64,...` URI,
/// or a raw base64 buffer from clipboard/drag-and-drop) into `images_dir` (`study-hub-data/images`)
/// and returns the persistent local file path.
pub fn save_image_to_dir(
    images_dir: &Path,
    payload: &str,
    filename_hint: Option<&str>,
) -> Result<String, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return Err("Image payload cannot be empty.".to_string());
    }

    fs::create_dir_all(images_dir)
        .map_err(|e| format!("Failed to create study-hub-data/images directory: {e}"))?;

    // Case 1: Data URL (`data:image/png;base64,...`)
    let (bytes, ext, derived_stem) = if let Some(rest) = trimmed.strip_prefix("data:") {
        let (meta, data_part) = rest
            .split_once(',')
            .ok_or_else(|| "Invalid data URL format: missing comma separator.".to_string())?;
        let mime_ext = meta
            .split(';')
            .next()
            .and_then(|m| m.strip_prefix("image/"))
            .unwrap_or("png");
        let decoded = if meta.contains(";base64") {
            decode_base64(data_part)?
        } else {
            percent_decode(data_part).into_bytes()
        };
        let resolved_ext = infer_image_extension(&decoded, Some(mime_ext));
        let stem = filename_hint.map(sanitize_stem).unwrap_or_else(|| "clipboard".to_string());
        (decoded, resolved_ext, stem)
    } else {
        // Check if `trimmed` is a local file path (or `file://` URL)
        let candidate_path_str = trimmed
            .strip_prefix("file://")
            .unwrap_or(trimmed);
        let candidate_path = Path::new(candidate_path_str);

        if candidate_path.exists() && candidate_path.is_file() {
            let file_bytes = fs::read(candidate_path)
                .map_err(|e| format!("Failed to read source image file '{candidate_path_str}': {e}"))?;
            let ext_hint = filename_hint.or(Some(candidate_path_str));
            let resolved_ext = infer_image_extension(&file_bytes, ext_hint);
            let stem = filename_hint
                .map(sanitize_stem)
                .unwrap_or_else(|| sanitize_stem(candidate_path_str));
            (file_bytes, resolved_ext, stem)
        } else {
            // Case 3: Raw base64 buffer from clipboard or drag-and-drop
            let decoded = decode_base64(trimmed).map_err(|_| {
                format!(
                    "Payload is neither an existing local file path nor valid base64 image data: '{}'",
                    trimmed.chars().take(48).collect::<String>()
                )
            })?;
            let resolved_ext = infer_image_extension(&decoded, filename_hint);
            let stem = filename_hint
                .map(sanitize_stem)
                .unwrap_or_else(|| "pasted_image".to_string());
            (decoded, resolved_ext, stem)
        }
    };

    if bytes.is_empty() {
        return Err("Decoded image payload contains 0 bytes.".to_string());
    }

    let ts = Utc::now().timestamp_millis();
    let seq = IMAGE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let unique_filename = format!("img_{ts}_{seq}_{derived_stem}.{ext}");
    let dest_path: PathBuf = images_dir.join(&unique_filename);

    fs::write(&dest_path, &bytes)
        .map_err(|e| format!("Failed to write image to '{}': {e}", dest_path.display()))?;

    let canonical = dest_path.canonicalize().unwrap_or(dest_path);
    Ok(canonical.to_string_lossy().to_string())
}

/// Resolves a `studyhub://` or `asset://` request URI (or filename/path) safely inside `images_dir`.
pub fn resolve_studyhub_image_bytes(
    images_dir: &Path,
    raw_uri_or_path: &str,
) -> Result<(Vec<u8>, &'static str), String> {
    let decoded = percent_decode(raw_uri_or_path.trim());

    // Strip custom scheme prefixes such as `studyhub://`, `http://studyhub.localhost/`, `asset://`, etc.
    let without_scheme = decoded
        .strip_prefix("studyhub://localhost/")
        .or_else(|| decoded.strip_prefix("http://studyhub.localhost/"))
        .or_else(|| decoded.strip_prefix("https://studyhub.localhost/"))
        .or_else(|| decoded.strip_prefix("studyhub://images/"))
        .or_else(|| decoded.strip_prefix("studyhub://"))
        .or_else(|| decoded.strip_prefix("asset://localhost/"))
        .or_else(|| decoded.strip_prefix("http://asset.localhost/"))
        .or_else(|| decoded.strip_prefix("asset://"))
        .unwrap_or(&decoded);

    let clean_target = without_scheme
        .split('?')
        .next()
        .unwrap_or(without_scheme)
        .split('#')
        .next()
        .unwrap_or(without_scheme)
        .trim_end_matches('/');

    // Extract the safe file name to prevent any directory traversal outside `study-hub-data/images`
    let file_name = Path::new(clean_target)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid image URI or filename: '{raw_uri_or_path}'"))?;

    let candidate_in_images = images_dir.join(file_name);
    let target_path = if candidate_in_images.exists() && candidate_in_images.is_file() {
        candidate_in_images
    } else {
        // Also check if `clean_target` is an exact path inside `images_dir`
        let direct = PathBuf::from(clean_target);
        if direct.exists() && direct.is_file() {
            if let (Ok(canon_dir), Ok(canon_file)) =
                (images_dir.canonicalize(), direct.canonicalize())
            {
                if canon_file.starts_with(&canon_dir) {
                    canon_file
                } else {
                    return Err("Access denied: path is outside study-hub-data/images.".to_string());
                }
            } else {
                return Err("Image file not found in study-hub-data/images.".to_string());
            }
        } else {
            return Err(format!(
                "Image '{}' not found in '{}'.",
                file_name,
                images_dir.display()
            ));
        }
    };

    let bytes = fs::read(&target_path)
        .map_err(|e| format!("Failed to read image '{}': {e}", target_path.display()))?;
    let ext = target_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_else(|| infer_image_extension(&bytes, None));
    let mime = mime_type_for_extension(ext);

    Ok((bytes, mime))
}

/// Reads an image from `images_dir` and returns a `data:<mime>;base64,...` URI.
pub fn read_image_as_data_url(images_dir: &Path, raw_uri_or_path: &str) -> Result<String, String> {
    let (bytes, mime) = resolve_studyhub_image_bytes(images_dir, raw_uri_or_path)?;
    let b64 = encode_base64(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 1x1 transparent PNG in base64
    const TINY_PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    #[test]
    fn test_save_image_from_base64_and_resolve_protocol() {
        let temp_dir = std::env::temp_dir()
            .join(format!("study_hub_media_test_{}", Utc::now().timestamp_nanos_opt().unwrap_or(1)));
        let images_dir = temp_dir.join("study-hub-data").join("images");

        // Test data URL input
        let data_url = format!("data:image/png;base64,{TINY_PNG_BASE64}");
        let saved_path =
            save_image_to_dir(&images_dir, &data_url, Some("diagram.png")).expect("save base64 image");
        assert!(saved_path.contains("study-hub-data"));
        assert!(saved_path.ends_with(".png"));
        assert!(Path::new(&saved_path).exists());

        // Test resolving via `studyhub://images/<filename>`
        let fname = Path::new(&saved_path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let uri = format!("studyhub://images/{fname}");
        let (bytes, mime) =
            resolve_studyhub_image_bytes(&images_dir, &uri).expect("resolve studyhub:// URI");
        assert_eq!(mime, "image/png");
        assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G']));

        // Test saving from an existing local file path
        let copied_path =
            save_image_to_dir(&images_dir, &saved_path, Some("copied_diagram.png"))
                .expect("save from file path");
        assert!(Path::new(&copied_path).exists());
        assert_ne!(saved_path, copied_path);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
