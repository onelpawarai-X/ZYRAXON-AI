# Copyright (c) 2026 onelpawarai. All rights reserved.

from django.dispatch import Signal

#: signal when client is authenticated
client_authenticated = Signal()

#: signal when token is revoked
token_revoked = Signal()

#: signal when token is authenticated
token_authenticated = Signal()
