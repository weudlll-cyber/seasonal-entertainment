# ============================================================
# File:        server.Dockerfile
# Path:        deploy/test/server.Dockerfile
# Project:     Seasonal Entertainment
# Description: A stand-in for a fresh Ubuntu server, for the installer's tests (deploy/test/
#              run.sh): systemd as PID 1, so timers, nginx and Docker run as on a real server.
#              Only what a stock Ubuntu server already has (git, ufw, iproute2) plus the test's
#              own tools (expect for the terminal, age for checking a backup); curl, openssl,
#              Docker and certbot are left to the installer. UBUNTU picks 24.04 or 22.04.
# ============================================================

ARG UBUNTU=24.04
FROM ubuntu:${UBUNTU}
ARG UBUNTU
LABEL seasonal.test=seasonal-install-test
ENV DEBIAN_FRONTEND=noninteractive container=docker
RUN apt-get update \
  && apt-get install -y --no-install-recommends systemd systemd-sysv dbus iproute2 git ufw \
    expect age \
  && rm -rf /var/lib/apt/lists/* \
  # The Docker image forbids packages to start services; a real server lets them (nginx, Docker).
  && rm -f /usr/sbin/policy-rc.d \
  # Consoles and the like have nothing to do in a container.
  && systemctl mask getty.target console-getty.service systemd-firstboot.service
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
