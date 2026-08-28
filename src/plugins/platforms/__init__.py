"""Platform plugin implementations.

Each platform (e.g. kook) under this package adapts an external chat platform
into the application: it normalizes incoming messages, renders outcomes back,
and wires its own persistence/config. The application layer never imports a
platform directly.
"""
