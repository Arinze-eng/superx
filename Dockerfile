FROM ghcr.io/tonresistor/teleton-agent:latest

USER root

# Copy the PowerX plugin into the Teleton plugins directory
COPY powerx-plugin/ /home/node/.teleton/plugins/powerx/

# Copy the startup script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /data && chown -R node:node /data /home/node/.teleton

USER node

EXPOSE 7777
ENTRYPOINT ["/app/docker-entrypoint.sh"]