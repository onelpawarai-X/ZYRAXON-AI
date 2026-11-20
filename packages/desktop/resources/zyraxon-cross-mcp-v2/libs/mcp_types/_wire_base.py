# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Shared pydantic base for the generated `mcp_types._v*` wire-shape packages."""

from pydantic import BaseModel, ConfigDict


class WireModel(BaseModel):
    """Base for generated wire models: enables `populate_by_name`; subclasses set `extra` themselves."""

    model_config = ConfigDict(populate_by_name=True)
