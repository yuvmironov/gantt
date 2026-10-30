FROM postgres:17-alpine

RUN apk add --no-cache bash
COPY db /db
COPY infrastructure/local/db-init.sh /db-init.sh
ENTRYPOINT ["/bin/sh", "/db-init.sh"]
