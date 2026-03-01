/**
 * Download a file from a URL using fetch + blob.
 * Falls back to opening in a new tab on failure.
 */
export async function handleDownload(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error('Download failed:', err);
    window.open(url, '_blank');
  }
}
