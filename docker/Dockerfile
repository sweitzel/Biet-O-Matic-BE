# docker build docker/ -t bom-be_builder:latest
# docker run --rm -it -v $(pwd):/src bom-be_builder:latest
FROM klakegg/hugo:0.76.5-ext-alpine

ENV BROWSER="chrome"

RUN apk add zip jq

ADD entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]