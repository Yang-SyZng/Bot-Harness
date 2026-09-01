"""Application Use Cases.

This layer orchestrates business workflow independently of any platform or
infrastructure. It depends only on Core entities/contracts and the narrow ports
it defines here; concrete wiring happens in the adapter / bootstrap layers.

The session execution framework lives here: routing (``SessionRouter``),
context assembly (``ContextBuilder``) and the execute step (``ExecuteTask``).
Legacy ``task_router`` / ``handle_incoming_message`` (old IncomingMessage
inbound orchestration) are being superseded by this framework.
"""

from src.application.context_builder import ContextBuilder, AgentContext
from src.application.execute_task import ExecuteTask
from src.application.handle_result import HandleResult
from src.application.session_router import SessionRoute, SessionRouter

__all__ = [
    "ExecuteTask",
    "HandleResult",
    "SessionRoute",
    "SessionRouter",
    "ContextBuilder",
    "AgentContext",
]
