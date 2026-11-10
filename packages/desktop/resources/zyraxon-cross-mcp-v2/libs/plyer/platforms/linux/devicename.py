# Copyright (c) 2026 onelpawarai. All rights reserved.

'''
Module of Linux API for plyer.devicename.
'''

import socket
from plyer.facades import DeviceName


class LinuxDeviceName(DeviceName):
    '''
    Implementation of Linux DeviceName API.
    '''

    def _get_device_name(self):
        hostname = socket.gethostname()
        return hostname


def instance():
    '''
    Instance for facade proxy.
    '''
    return LinuxDeviceName()
