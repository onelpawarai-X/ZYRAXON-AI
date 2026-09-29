# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

'''
Android SMS
-----------
'''

from jnius import autoclass
from plyer.facades import Sms

SmsManager = autoclass('android.telephony.SmsManager')


class AndroidSms(Sms):

    def _send(self, **kwargs):
        sms = SmsManager.getDefault()

        recipient = kwargs.get('recipient')
        message = kwargs.get('message')

        if sms:
            sms.sendTextMessage(recipient, None, message, None, None)


def instance():
    return AndroidSms()
