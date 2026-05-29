import sys as _sys

from . import collector_service_impl as _collector_service_impl
from .collector_service_impl import *  # noqa: F401,F403

_sys.modules[__name__] = _collector_service_impl
