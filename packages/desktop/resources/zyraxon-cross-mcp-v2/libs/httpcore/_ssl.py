# Copyright (c) 2026 onelpawarai. All rights reserved.

import ssl

import certifi


def default_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    context.load_verify_locations(certifi.where())
    return context
