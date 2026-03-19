export const openPdfPreview = (blobUrl: string, filename: string) => {
    const newWindow = window.open('', '_blank');
    if (!newWindow) return;

    newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${filename}</title>
            <style>
                :root {
                    --bg-dark: #323639;
                    --bg-panel: #525659;
                    --text-main: #f1f3f4;
                    --text-muted: #bdc1c6;
                    --accent-color: #8ab4f8;
                    --accent-hover: #aecbfa;
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background-color: var(--bg-panel);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    overflow: hidden;
                }
                .toolbar {
                    background-color: var(--bg-dark);
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 16px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.5);
                    z-index: 10;
                    flex-shrink: 0;
                }
                .title-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                }
                .title {
                    color: var(--text-main);
                    font-size: 14px;
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .badge {
                    background-color: rgba(255,255,255,0.1);
                    color: var(--text-muted);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }
                .actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .btn {
                    background-color: transparent;
                    color: var(--text-main);
                    border: 1px solid rgba(255,255,255,0.2);
                    padding: 6px 16px;
                    border-radius: 4px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                .btn:hover {
                    background-color: rgba(255,255,255,0.1);
                    border-color: rgba(255,255,255,0.3);
                }
                .btn-primary {
                    background-color: var(--accent-color);
                    color: #202124;
                    border-color: transparent;
                }
                .btn-primary:hover {
                    background-color: var(--accent-hover);
                }
                .pdf-container {
                    flex: 1;
                    width: 100%;
                    background-color: var(--bg-panel);
                    position: relative;
                }
                iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                }
                /* Loading spinner overlay */
                .loader {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 48px;
                    height: 48px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-left-color: var(--accent-color);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    z-index: 1;
                    pointer-events: none;
                }
                @keyframes spin { 100% { transform: translate(-50%, -50%) rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <div class="title-container">
                    <span class="badge">SECURE VIEWER</span>
                    <span class="title" title="${filename}">${filename}</span>
                </div>
                <div class="actions">
                    <button class="btn" onclick="printPdf()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print
                    </button>
                    <a href="${blobUrl}" download="${filename}" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download PDF
                    </a>
                </div>
            </div>
            <div class="pdf-container">
                <div class="loader" id="loader"></div>
                <!-- Hide the native toolbar but preserve zoom/pan -->
                <iframe id="pdfFrame" src="${blobUrl}#toolbar=0&navpanes=0&scrollbar=1" onload="document.getElementById('loader').style.display='none'"></iframe>
            </div>

            <script>
                // Handle printing the internal iframe rather than the wrapper
                function printPdf() {
                    const frame = document.getElementById('pdfFrame');
                    try {
                        frame.contentWindow.focus();
                        frame.contentWindow.print();
                    } catch (e) {
                        // Fallback if cross-origin rules prevent iframe printing (unlikely for blob urls)
                        window.print();
                    }
                }
            </script>
        </body>
        </html>
    `);
    newWindow.document.close();
};
