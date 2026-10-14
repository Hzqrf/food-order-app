from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.deps import DB, AdminUser, BranchDep
from app.reports import queries, schemas

router = APIRouter(prefix="/admin", tags=["admin-reports"])


@router.get("/dashboard", response_model=schemas.Dashboard)
def dashboard(_: AdminUser, branch: BranchDep, db: DB):
    """Everything on the owner's Today screen in one call."""
    return queries.dashboard(db, branch)


@router.get("/menu/units-sold", response_model=list[schemas.UnitsSoldRow])
def units_sold(_: AdminUser, branch: BranchDep, db: DB, days: Annotated[int, Query(ge=1, le=90)] = 7):
    """Units per item over the last N business days, for the Menu page's "sold in 7 days" column."""
    return queries.units_sold(db, branch, days)


@router.get("/reports", response_model=schemas.Report)
def report(_: AdminUser, branch: BranchDep, db: DB, r: Annotated[schemas.Range, Query()]):
    return queries.report(db, branch, r)


@router.get("/reports/orders.csv")
def orders_csv(_: AdminUser, branch: BranchDep, db: DB, r: Annotated[schemas.Range, Query()]):
    """The accountant's export: one row per order in the range."""
    body = queries.orders_csv(db, branch, r.date_from, r.date_to)
    name = f"orders-{r.date_from.isoformat()}-to-{r.date_to.isoformat()}.csv"
    return Response(body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/audit-logs", response_model=schemas.AuditPage)
def audit_logs(_: AdminUser, branch: BranchDep, db: DB, f: Annotated[schemas.AuditFilter, Query()]):
    return queries.audit_page(db, branch, f)
