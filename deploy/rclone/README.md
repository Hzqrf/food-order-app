Put `rclone.conf` here to copy each night's backup off the server, then set `RCLONE_REMOTE` in
`deploy/.env`. Make the file on any computer with `rclone config` (for example a Backblaze B2 or
Google Drive remote) and copy it over. It is ignored by git: it holds the storage account's keys.
