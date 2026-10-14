# Nightly backups. The MySQL image brings a matching mysqldump and client; rclone is for the
# optional copy off the server.
FROM mysql:8.4
COPY --from=rclone/rclone:1.68.2 /usr/local/bin/rclone /usr/local/bin/rclone
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
COPY *.sh /scripts/
RUN chmod +x /scripts/*.sh
ENTRYPOINT []
CMD ["/scripts/run.sh"]
