# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

'''
Module of iOS API for plyer.uniqueid.
'''

from pyobjus import autoclass
from pyobjus.dylib_manager import load_framework
from plyer.facades import UniqueID

load_framework('/System/Library/Frameworks/UIKit.framework')
UIDevice = autoclass('UIDevice')


class IOSUniqueID(UniqueID):
    '''
    Implementation of iOS uniqueid API.
    '''

    def _get_uid(self):
        uuid = UIDevice.currentDevice().identifierForVendor.UUIDString()
        return uuid.UTF8String()


def instance():
    '''
    Instance for facade proxy.
    '''
    return IOSUniqueID()
