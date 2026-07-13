FROM ghcr.io/tonresistor/teleton-agent:latest

USER root

# Copy the startup script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 7777
ENTRYPOINT ["/app/docker-entrypoint.sh"]