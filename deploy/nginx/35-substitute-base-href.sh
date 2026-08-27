#!/bin/sh
set -e

if [ -n "$BASE_HREF" ]; then
    echo "Substituting <base href> with $BASE_HREF in index.html files"
    find /usr/share/nginx/html -name "index.html" -type f -exec sed -i "s|<base href=\"/\" />|<base href=\"$BASE_HREF\" />|g" {} +
fi
