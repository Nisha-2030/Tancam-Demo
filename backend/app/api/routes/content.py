from fastapi import APIRouter

from app.schemas.common import ApiResponse
from app.schemas.content import (
    GenerateNotesRequest,
    GenerateNotesResponse,
    GenerateQuizRequest,
    GenerateQuizResponse,
    LinkStaticGKRequest,
    LinkStaticGKResponse,
    SyncStaticGKResponse,
)
from app.services.content_service import content_service
from app.services.static_gk_service import static_gk_service

router = APIRouter()


@router.post("/notes", response_model=ApiResponse)
async def generate_notes(payload: GenerateNotesRequest) -> ApiResponse:
    notes, key_points, generated_by = await content_service.generate_notes(payload.article, payload.exam_context)
    return ApiResponse(
        data=GenerateNotesResponse(notes=notes, key_points=key_points, generated_by=generated_by).model_dump(),
        message="Notes generated successfully",
    )


@router.post("/quiz", response_model=ApiResponse)
async def generate_quiz(payload: GenerateQuizRequest) -> ApiResponse:
    questions, generated_by = await content_service.generate_quiz(payload.article, payload.num_questions)
    return ApiResponse(
        data=GenerateQuizResponse(questions=questions, generated_by=generated_by).model_dump(),
        message="Quiz generated successfully",
    )


@router.post("/static-gk/link", response_model=ApiResponse)
async def link_static_gk(payload: LinkStaticGKRequest) -> ApiResponse:
    result = await static_gk_service.link_article(payload)
    return ApiResponse(
        data=LinkStaticGKResponse(**result.model_dump()).model_dump(),
        message="Static GK topics linked successfully",
    )


@router.post("/static-gk/sync", response_model=ApiResponse)
async def sync_static_gk_dataset() -> ApiResponse:
    upserted_count = await static_gk_service.sync_json_dataset_to_mongo()
    return ApiResponse(
        data=SyncStaticGKResponse(upserted_count=upserted_count, source="json_dataset").model_dump(),
        message="Static GK dataset synced to MongoDB",
    )


@router.post("/static-gk/sync-external", response_model=ApiResponse)
async def sync_external_static_gk_dataset() -> ApiResponse:
    upserted_count = await static_gk_service.sync_external_dataset_to_mongo()
    return ApiResponse(
        data=SyncStaticGKResponse(upserted_count=upserted_count, source="external_dataset").model_dump(),
        message="External Static GK dataset synced to MongoDB",
    )
