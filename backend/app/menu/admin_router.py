from fastapi import APIRouter, File, Request, UploadFile

from app.deps import DB, AdminUser, client_ip
from app.menu import schemas, service

router = APIRouter(prefix="/admin/menu", tags=["admin-menu"])


def _cat(c) -> schemas.AdminCategory:
    return schemas.AdminCategory.model_validate(c, from_attributes=True)


def _group(g) -> schemas.AdminOptionGroup:
    return schemas.AdminOptionGroup(
        id=g.id, name=g.name, name_ms=g.name_ms, min_select=g.min_select, max_select=g.max_select,
        is_active=g.is_active,
        options=[schemas.AdminOption.model_validate(o, from_attributes=True) for o in g.options],
    )


@router.get("", response_model=schemas.AdminMenuOut)
def get_admin_menu(_: AdminUser, db: DB):
    return service.admin_menu(db)


@router.post("/categories", response_model=schemas.AdminCategory, status_code=201)
def create_category(body: schemas.CategoryIn, _: AdminUser, db: DB):
    return _cat(service.create_category(db, body))


@router.patch("/categories/{cat_id}", response_model=schemas.AdminCategory)
def update_category(cat_id: int, body: schemas.CategoryPatch, admin: AdminUser, db: DB, request: Request):
    return _cat(service.update_category(db, admin, cat_id, body, client_ip(request)))


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, admin: AdminUser, db: DB, request: Request):
    service.update_category(db, admin, cat_id, schemas.CategoryPatch(is_active=False), client_ip(request))


@router.post("/items", response_model=schemas.AdminItem, status_code=201)
def create_item(body: schemas.ItemIn, admin: AdminUser, db: DB, request: Request):
    return service.create_item(db, admin, body, client_ip(request))


@router.patch("/items/{item_id}", response_model=schemas.AdminItem)
def update_item(item_id: int, body: schemas.ItemPatch, admin: AdminUser, db: DB, request: Request):
    return service.update_item(db, admin, item_id, body, client_ip(request))


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, admin: AdminUser, db: DB, request: Request):
    service.deactivate_item(db, admin, item_id, client_ip(request))


@router.put("/items/{item_id}/option-groups", response_model=schemas.AdminItem)
def set_item_groups(item_id: int, body: schemas.ItemGroupsIn, _: AdminUser, db: DB):
    return service.set_item_groups(db, item_id, body)


@router.post("/items/{item_id}/image", response_model=schemas.AdminItem)
def upload_image(item_id: int, _: AdminUser, db: DB, file: UploadFile = File(...)):
    data = file.file.read(service.MAX_IMAGE_BYTES + 1)
    return service.save_item_image(db, item_id, data)


@router.post("/option-groups", response_model=schemas.AdminOptionGroup, status_code=201)
def create_group(body: schemas.OptionGroupIn, _: AdminUser, db: DB):
    return _group(service.create_group(db, body))


@router.patch("/option-groups/{group_id}", response_model=schemas.AdminOptionGroup)
def update_group(group_id: int, body: schemas.OptionGroupPatch, admin: AdminUser, db: DB, request: Request):
    return _group(service.update_group(db, admin, group_id, body, client_ip(request)))


@router.delete("/option-groups/{group_id}", status_code=204)
def delete_group(group_id: int, admin: AdminUser, db: DB, request: Request):
    service.update_group(db, admin, group_id, schemas.OptionGroupPatch(is_active=False), client_ip(request))


@router.post("/options", response_model=schemas.AdminOption, status_code=201)
def create_option(body: schemas.OptionIn, admin: AdminUser, db: DB, request: Request):
    return schemas.AdminOption.model_validate(service.create_option(db, admin, body, client_ip(request)),
                                              from_attributes=True)


@router.patch("/options/{option_id}", response_model=schemas.AdminOption)
def update_option(option_id: int, body: schemas.OptionPatch, admin: AdminUser, db: DB, request: Request):
    return schemas.AdminOption.model_validate(
        service.update_option(db, admin, option_id, body, client_ip(request)), from_attributes=True)


@router.delete("/options/{option_id}", status_code=204)
def delete_option(option_id: int, admin: AdminUser, db: DB, request: Request):
    service.update_option(db, admin, option_id, schemas.OptionPatch(is_active=False), client_ip(request))


@router.put("/sort", status_code=204)
def sort(body: schemas.SortIn, _: AdminUser, db: DB):
    service.sort(db, body)
