# Copyright (c) 2026 onelpawarai. All rights reserved.

import pywintypes
import win32security

sa = pywintypes.SECURITY_ATTRIBUTES()
tmp_sid = win32security.LookupAccountName("", "tmp")[0]
sa.SetSecurityDescriptorOwner(tmp_sid, 0)
sid = sa.SECURITY_DESCRIPTOR.GetSecurityDescriptorOwner()
print(win32security.LookupAccountSid("", sid))
