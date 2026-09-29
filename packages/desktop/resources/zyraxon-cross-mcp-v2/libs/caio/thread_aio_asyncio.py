# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from .asyncio_base import AsyncioContextBase
from .thread_aio import Context, Operation


class AsyncioContext(AsyncioContextBase):
    MAX_REQUESTS_DEFAULT = 512
    OPERATION_CLASS = Operation
    CONTEXT_CLASS = Context

    def _destroy_context(self):
        self.context.close()
