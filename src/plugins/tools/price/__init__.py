"""Model pricing tool: download and query the LiteLLM pricing table.

A generic tool, decoupled from any concrete platform. It refreshes LiteLLM
model pricing data (with proxy/ETag handling) and exposes lookup helpers.
"""
