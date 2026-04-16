#!/bin/bash
# Use a different delimiter for sed because the script contains '|'
# Or better: use a temporary file to avoid complex shell quoting issues
echo "$Clarity_Code" > clarity.txt
sed -i -e '/<!-- CLARITY_SCRIPT -->/r clarity.txt' -e '/<!-- CLARITY_SCRIPT -->/d' index.html
rm clarity.txt
