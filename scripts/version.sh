#!/bin/bash -e

ROOT_DIR="$(dirname "$(dirname -- "$(readlink -f -- "$0")")")"

function bump() {
  cd $ROOT_DIR
  local old=$1
  local new=$2
  sed -i 's!'$old'!'$new'!g' app/index.html app/package.json
  cd $ROOT_DIR/app
  npm install
  exit 0
}

if [ "$1" == "bump" ] && [ "$#" == "3" ]; then
  # ./version.sh bump 0.15.2 0.16
  bump $2 $3
fi

exit 1

