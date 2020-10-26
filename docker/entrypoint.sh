#!/bin/sh

set -e

BUILD_DIR=/src/build
if [ "$BROWSER" = "firefox" ]
then
  BUILD_DIR=/src/build-firefox
fi

if [ ! -e "/src/package.json" ]
then
  echo "ERROR: Please mount Biet-O-Matic BE source folder to docker container under /src"
  echo "Example: docker run --rm -it -v $(pwd):/src --env BROWSER=chrome bom-be_builder:latest"
  exit 1
fi

BOM_VERSION=$(jq -Mer .version package.json)
if [ "$BROWSER" = "firefox" ]
then
  BOM_VERSION="${BOM_VERSION}-firefox"
fi

echo ">> Building bom-be:${BOM_VERSION} <<"

if [ -e "${BUILD_DIR}" ]
then
  echo ">> Removing old build folder ${BUILD_DIR} <<"
  rm -rf "${BUILD_DIR}"
fi

echo ">> Initialize node modules (yarn) <<"
/bin/yarn install

echo ">> Generate JS/HTML bundles (yarn/webpack) <<"
/bin/yarn build

echo ">> Generate documentation (hugo) <<"
if git status >/dev/null 2>&1
then
  /bin/hugo --source documentation --environment=production --destination ${BUILD_DIR}/doc
else
  /bin/hugo --source documentation --environment=production --enableGitInfo=false --destination ${BUILD_DIR}/doc
fi
rm ${BUILD_DIR}/doc/manifest.json

echo ">> Generate zip bundle <<"
pushd "${BUILD_DIR}" >/dev/null
zip -r /src/bom-be_${BOM_VERSION}.zip .
popd >/dev/null

echo ">> ALL DONE <<"