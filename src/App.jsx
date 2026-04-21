import { useEffect, useMemo, useState } from "react";

function getErrorMessage(err, fallback) {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (typeof err === "string" && err) {
    return err;
  }

  return fallback;
}

function createPreviewUrl(file) {
  if (!file || !file.buffer) {
    return "";
  }

  try {
    let uint8;

    if (file.buffer?.type === "Buffer" && Array.isArray(file.buffer.data)) {
      uint8 = new Uint8Array(file.buffer.data);
    } else if (file.buffer instanceof ArrayBuffer) {
      uint8 = new Uint8Array(file.buffer);
    } else if (file.buffer instanceof Uint8Array) {
      uint8 = file.buffer;
    } else if (Array.isArray(file.buffer)) {
      uint8 = new Uint8Array(file.buffer);
    } else {
      console.warn("Unknown buffer format:", file.buffer);
      return "";
    }

    const blob = new Blob([uint8], {
      type: file.mimeType || "application/octet-stream",
    });

    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Preview error:", error);
    return "";
  }
}

function isImageFile(file) {
  return Boolean(file?.mimeType && file.mimeType.startsWith("image/"));
}

function isVideoFile(file) {
  return Boolean(file?.mimeType && file.mimeType.startsWith("video/"));
}

function App() {
  const [spreadsheetPath, setSpreadsheetPath] = useState("");
  const [posts, setPosts] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [multipartPreview, setMultipartPreview] = useState(null);
  const [endpoint, setEndpoint] = useState("https://httpbin.org/post");
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [previewUrls, setPreviewUrls] = useState([]);

  const selectedPost = useMemo(
    () => posts[selectedIndex] ?? null,
    [posts, selectedIndex],
  );

  useEffect(() => {
    if (!selectedPost?.mediaFiles?.length) {
      setPreviewUrls([]);
      return undefined;
    }

    const urls = selectedPost.mediaFiles.map((file) => createPreviewUrl(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [selectedPost]);

  const handlePickSpreadsheet = async () => {
    try {
      setError("");
      setIsBusy(true);

      const filePath = await window.electronAPI.pickSpreadsheet();

      if (!filePath) {
        return;
      }

      setSpreadsheetPath(filePath);

      const result = await window.electronAPI.parseSpreadsheet(filePath);

      setPosts(result.posts || []);
      setSelectedIndex(0);
      setUploadResult(null);

      if (result.posts?.[0]) {
        const preview = await window.electronAPI.buildMultipartPreview(
          result.posts[0],
        );
        setMultipartPreview(preview);
      } else {
        setMultipartPreview(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to parse spreadsheet."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectPost = async (index) => {
    try {
      setError("");
      setSelectedIndex(index);

      const preview = await window.electronAPI.buildMultipartPreview(
        posts[index],
      );
      setMultipartPreview(preview);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to build multipart preview."));
    }
  };

  const handleUploadAll = async () => {
    try {
      setError("");
      setIsBusy(true);

      const result = await window.electronAPI.uploadPosts({ posts, endpoint });
      setUploadResult(result);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to upload posts."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="hero">
        <h1>Electron Starter React</h1>
        <p>
          XLSX/XLS/CSV → each row becomes one post object. All columns are
          preserved as keys. Files from <code>media_urls</code> are split by{" "}
          <code>|</code>, read from absolute paths, and appended to{" "}
          <code>FormData</code> under <code>media</code>.
        </p>
      </div>

      <div className="toolbar">
        <button onClick={handlePickSpreadsheet} disabled={isBusy}>
          {isBusy ? "Working…" : "Choose spreadsheet"}
        </button>
        <input
          value={spreadsheetPath}
          readOnly
          placeholder="Pick .xlsx / .xls / .csv"
        />
      </div>

      <div className="toolbar">
        <input
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="Upload endpoint"
        />
        <button onClick={handleUploadAll} disabled={!posts.length || isBusy}>
          Upload all posts
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="content-grid">
        <section className="card">
          <h2>Posts</h2>
          <div className="meta-line">Total rows parsed: {posts.length}</div>

          <div className="posts-list">
            {posts.map((post, index) => (
              <button
                key={post.rowNumber}
                className={`post-item ${selectedIndex === index ? "selected" : ""}`}
                onClick={() => handleSelectPost(index)}
              >
                <div className="post-title">Row {post.rowNumber}</div>
                <div className="post-subtitle">
                  {post.data.title ||
                    post.data.subtitle ||
                    post.data.description ||
                    "No title column"}
                </div>
                <div className="post-badges">
                  <span>media: {post.mediaFiles.length}</span>
                  <span>missing: {post.missingMedia.length}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Selected post object</h2>

          {selectedPost ? (
            <>
              <pre>{JSON.stringify(selectedPost.data, null, 2)}</pre>

              {selectedPost.mediaFiles.length ? (
                <div>
                  <h3>Resolved media files</h3>

                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginBottom: "16px",
                    }}
                  >
                    {selectedPost.mediaFiles.map((file, index) => {
                      const previewUrl = previewUrls[index];
                      const isImage = isImageFile(file);
                      const isVideo = isVideoFile(file);

                      return (
                        <div
                          key={`${file.originalPath}-${index}`}
                          style={{
                            width: "140px",
                            border: "1px solid #2a2a2a",
                            borderRadius: "10px",
                            padding: "8px",
                            background: "#151515",
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "90px",
                              borderRadius: "8px",
                              overflow: "hidden",
                              background: "#0f0f0f",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: "8px",
                            }}
                          >
                            {previewUrl && isImage ? (
                              <img
                                src={previewUrl}
                                alt={file.filename}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  display: "block",
                                }}
                              />
                            ) : null}

                            {previewUrl && isVideo ? (
                              <video
                                src={previewUrl}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  display: "block",
                                }}
                                muted
                                playsInline
                                controls
                              />
                            ) : null}

                            {!previewUrl || (!isImage && !isVideo) ? (
                              <span style={{ fontSize: "12px", color: "#aaa" }}>
                                No preview
                              </span>
                            ) : null}
                          </div>

                          <div style={{ fontSize: "12px", lineHeight: 1.4 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                wordBreak: "break-word",
                              }}
                            >
                              {file.filename}
                            </div>
                            <div style={{ color: "#aaa" }}>{file.mimeType}</div>
                            <div style={{ color: "#aaa" }}>
                              {file.size} bytes
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <ul>
                    {selectedPost.mediaFiles.map((file) => (
                      <li key={file.originalPath}>
                        {file.filename} — {file.mimeType} — {file.size} bytes
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedPost.missingMedia.length ? (
                <div>
                  <h3>Missing media</h3>
                  <ul>
                    {selectedPost.missingMedia.map((filePath) => (
                      <li key={filePath}>{filePath}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">No post selected yet.</div>
          )}
        </section>

        <section className="card">
          <h2>Multipart preview</h2>
          {multipartPreview ? (
            <>
              <div className="meta-line">{multipartPreview.note}</div>
              <div className="entries-list">
                {multipartPreview.previewEntries.map((entry, index) => (
                  <div className="entry-row" key={`${entry.key}-${index}`}>
                    <strong>{entry.key}</strong>
                    <span>{entry.value}</span>
                    <em>{entry.type}</em>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              Pick a spreadsheet to see FormData preview.
            </div>
          )}
        </section>
      </div>

      {uploadResult ? (
        <section className="card upload-results">
          <h2>Upload result</h2>
          <pre>{JSON.stringify(uploadResult, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}

export default App;
