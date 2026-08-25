from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import Connection, MetaData
from sqlalchemy.engine import Inspector


@dataclass
class SchemaIssue:
    """A single missing table or missing column found while verifying."""

    table: str
    kind: str  # "missing_table" | "missing_column"
    column: str | None = None
    message: str = ""


@dataclass
class SchemaReport:
    """Aggregate result of a schema verification run."""

    issues: list[SchemaIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues

    @property
    def missing_tables(self) -> list[str]:
        return [i.table for i in self.issues if i.kind == "missing_table"]

    @property
    def missing_columns(self) -> list[tuple[str, str]]:
        return [(i.table, i.column or "") for i in self.issues if i.kind == "missing_column"]


def verify_schema(
    connection: Connection,
    metadata: MetaData,
    *,
    required_columns: dict[str, list[str]] | None = None,
) -> SchemaReport:
    """Verify that ``metadata``'s tables exist and expose required columns.

    Args:
        connection: A live (sync) SQLAlchemy connection.
        metadata: The ``MetaData`` describing the expected schema.
        required_columns: Optional map of ``{table_name: [columns]}``. Columns
            listed are required on top of the columns already present in the
            model definitions.

    Returns:
        A class:`SchemaReport` describing any missing tables/columns.
    """
    report = SchemaReport()
    inspector: Inspector = None  # type: ignore[assignment]
    existing: dict[str, list[str]] = {}

    try:
        inspector = _inspect(connection)
        existing = {name: inspector.get_columns(name) for name in inspector.get_table_names()}
    except Exception as exc:  # pragma: no cover - DB driver failures
        report.issues.append(
            SchemaIssue(table="", kind="inspection", message=str(exc))
        )
        return report

    expected = {t.name: _required(t, required_columns) for t in metadata.sorted_tables}

    for table, cols in expected.items():
        if table not in existing:
            report.issues.append(
                SchemaIssue(table=table, kind="missing_table", message=f"table '{table}' is missing")
            )
            continue
        present = {c["name"] for c in existing[table]}
        for col in cols:
            if col not in present:
                report.issues.append(
                    SchemaIssue(
                        table=table,
                        kind="missing_column",
                        column=col,
                        message=f"column '{col}' is missing on table '{table}'",
                    )
                )

    return report


def _inspect(connection: Connection) -> Inspector:
    from sqlalchemy import inspect

    return inspect(connection)


def _required(table, extra: dict[str, list[str]] | None) -> list[str]:
    cols = [c.name for c in table.columns]
    if extra:
        cols += extra.get(table.name, [])
    return cols
