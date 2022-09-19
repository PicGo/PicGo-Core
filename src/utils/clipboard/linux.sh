#!/bin/sh

if [ -z "$DISPLAY" ]; then
    echo "no support" >&2
    exit 1
fi

case "$XDG_SESSION_TYPE" in
wayland)
    command -v wl-copy >/dev/null 2>&1 || {
        echo >&2 "no wl-clipboard"
        exit 1
    }
    filePath=$(wl-copy -o 2>/dev/null | grep ^file:// | cut -c8-)
    if [ -z "$filePath" ]; then
        if
            wl-copy -t image/png image/png -o >"$1" 2>/dev/null
        then
            echo "$1"
        else
            rm -f "$1"
            echo "no image"
        fi
    else
        echo "$filePath"
    fi
    ;;
x11 | tty)
    # require xclip(see http://stackoverflow.com/questions/592620/check-if-a-program-exists-from-a-bash-script/677212#677212)
    command -v xclip >/dev/null 2>&1 || {
        echo >&2 "no xclip"
        exit 1
    }
    # write image in clipboard to file (see http://unix.stackexchange.com/questions/145131/copy-image-from-clipboard-to-file)
    filePath=$(xclip -selection clipboard -o 2>/dev/null | grep ^file:// | cut -c8-)
    if [ -z "$filePath" ]; then
        if
            xclip -selection clipboard -target image/png -o >"$1" 2>/dev/null
        then
            echo "$1"
        else
            rm -f "$1"
            echo "no image"
        fi
    else
        echo "$filePath"
    fi
    ;;
esac
