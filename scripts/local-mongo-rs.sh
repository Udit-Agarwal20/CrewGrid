#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/.mongo-data/rs0"
PID_FILE="${ROOT_DIR}/.mongo-data/mongod.pid"
LOG_FILE="${ROOT_DIR}/.mongo-data/mongod.log"
PORT=27017
HOST="127.0.0.1"

MONGOD_BIN="/opt/homebrew/bin/mongod"
MONGOSH_BIN="/opt/homebrew/bin/mongosh"

if [[ ! -x "${MONGOD_BIN}" ]]; then
  MONGOD_BIN="$(which mongod || true)"
fi
if [[ ! -x "${MONGOSH_BIN}" ]]; then
  MONGOSH_BIN="$(which mongosh || true)"
fi

if [[ -z "${MONGOD_BIN}" || ! -x "${MONGOD_BIN}" ]]; then
  echo "Error: mongod binary not found." >&2
  exit 1
fi

start() {
  mkdir -p "${DATA_DIR}"

  if [[ -f "${PID_FILE}" ]]; then
    PID="$(cat "${PID_FILE}")"
    if ps -p "${PID}" > /dev/null 2>&1; then
      echo "mongod is already running with PID ${PID} on port ${PORT}."
      exit 0
    else
      rm -f "${PID_FILE}"
    fi
  fi

  nohup "${MONGOD_BIN}" \
    --replSet rs0 \
    --port "${PORT}" \
    --dbpath "${DATA_DIR}" \
    --bind_ip "${HOST}" \
    </dev/null > "${LOG_FILE}" 2>&1 &
  MONGOD_PID=$!
  disown "${MONGOD_PID}" 2>/dev/null || true
  echo "${MONGOD_PID}" > "${PID_FILE}"

  echo "Waiting for mongod (PID: ${MONGOD_PID}) to accept connections..."
  for i in {1..30}; do
    if "${MONGOSH_BIN}" --port "${PORT}" --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  echo "Initializing replica set 'rs0' if not already initiated..."
  "${MONGOSH_BIN}" --port "${PORT}" --quiet --eval '
    try {
      const status = rs.status();
      if (status.ok === 1) {
        print("Replica set already initialized.");
      }
    } catch (e) {
      const res = rs.initiate({
        _id: "rs0",
        members: [{ _id: 0, host: "127.0.0.1:27017" }]
      });
      printjson(res);
    }
  '

  echo "Waiting for PRIMARY state..."
  for i in {1..30}; do
    IS_PRIMARY="$("${MONGOSH_BIN}" --port "${PORT}" --quiet --eval 'db.isMaster().ismaster' || echo 'false')"
    if [[ "${IS_PRIMARY}" == "true" ]]; then
      echo "MongoDB replica set rs0 is ready and in PRIMARY state!"
      exit 0
    fi
    sleep 0.5
  done

  echo "Warning: Timeout waiting for PRIMARY state. Check ${LOG_FILE}."
}

stop() {
  if [[ -f "${PID_FILE}" ]]; then
    PID="$(cat "${PID_FILE}")"
    echo "Stopping mongod PID ${PID}..."
    kill "${PID}" 2>/dev/null || true
    for i in {1..20}; do
      if ! ps -p "${PID}" > /dev/null 2>&1; then
        rm -f "${PID_FILE}"
        echo "mongod stopped."
        return 0
      fi
      sleep 0.5
    done
    echo "Forcing termination of PID ${PID}..."
    kill -9 "${PID}" 2>/dev/null || true
    rm -f "${PID_FILE}"
  else
    echo "No PID file found. Checking port ${PORT}..."
    PORT_PID="$(lsof -t -i:"${PORT}" || true)"
    if [[ -n "${PORT_PID}" ]]; then
      echo "Killing process ${PORT_PID} on port ${PORT}..."
      kill "${PORT_PID}" || kill -9 "${PORT_PID}"
    else
      echo "mongod is not running."
    fi
  fi
}

status() {
  if [[ -f "${PID_FILE}" ]]; then
    PID="$(cat "${PID_FILE}")"
    if ps -p "${PID}" > /dev/null 2>&1; then
      echo "mongod running (PID: ${PID})"
      "${MONGOSH_BIN}" --port "${PORT}" --eval 'rs.status().members.map(m => ({ name: m.name, stateStr: m.stateStr }))'
      return 0
    fi
  fi
  echo "mongod is not running."
  return 1
}

clean() {
  stop || true
  echo "Removing local replica set data in ${DATA_DIR}..."
  rm -rf "${ROOT_DIR}/.mongo-data"
  echo "Clean complete."
}

case "${1:-start}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  status)
    status
    ;;
  clean)
    clean
    ;;
  restart)
    stop || true
    sleep 1
    start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart|clean}"
    exit 1
    ;;
esac

