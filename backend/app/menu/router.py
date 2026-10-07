from fastapi import APIRouter

from app.deps import DB, StaffUser
from app.menu import schemas, service

router = APIRouter(tags=["menu"])


@router.get("/menu", response_model=schemas.MenuOut)
def get_menu(db: DB):
    # Cached in the process for 30 s and dropped on every change. Not cached by browsers, so a
    # sold-out switch shows at once on the screen that flipped it.
    return service.public_menu(db)


@router.patch("/staff/menu/items/{item_id}/sold-out", status_code=204)
def item_sold_out(item_id: int, body: schemas.SoldOutIn, _: StaffUser, db: DB):
    service.set_item_sold_out(db, item_id, body.is_sold_out)


@router.patch("/staff/menu/options/{option_id}/sold-out", status_code=204)
def option_sold_out(option_id: int, body: schemas.SoldOutIn, _: StaffUser, db: DB):
    service.set_option_sold_out(db, option_id, body.is_sold_out)
