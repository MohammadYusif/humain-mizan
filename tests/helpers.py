"""Example tools used to test the challenge-agnostic kit (calculator + a write tool)."""

import ast
import operator

from pydantic import BaseModel, Field

from hack.config import Settings
from hack.tools import ToolRegistry

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("unsupported expression")


class CalculatorArgs(BaseModel):
    expression: str = Field(description="Arithmetic expression")


class RestartArgs(BaseModel):
    service: str


def example_registry(settings: Settings) -> ToolRegistry:
    registry = ToolRegistry(approve_writes=settings.approve_writes)

    @registry.register("calculator", "Evaluate arithmetic.", CalculatorArgs)
    def calculator(args: CalculatorArgs) -> str:
        return str(_eval(ast.parse(args.expression, mode="eval").body))

    @registry.register("restart_service", "Restart a service.", RestartArgs, risk="write")
    def restart_service(args: RestartArgs) -> str:
        return f"{args.service} restarted"

    return registry
