# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""call using an open ADO connection --> list of table names"""

from . import adodbapi


def names(connection_object):
    ado = connection_object.adoConn
    schema = ado.OpenSchema(20)  # constant = adSchemaTables

    tables = []
    while not schema.EOF:
        name = adodbapi.getIndexedValue(schema.Fields, "TABLE_NAME").Value
        tables.append(name)
        schema.MoveNext()
    del schema
    return tables
