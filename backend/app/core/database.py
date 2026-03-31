import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)


class MongoManager:
    client: AsyncIOMotorClient | None = None
    database: AsyncIOMotorDatabase | None = None


mongo_manager = MongoManager()


async def connect_to_mongo() -> None:
    if mongo_manager.client is not None:
        return

    try:
        mongo_manager.client = AsyncIOMotorClient(settings.mongodb_uri)
        await mongo_manager.client.admin.command("ping")
        mongo_manager.database = mongo_manager.client[settings.mongodb_db_name]
        logger.info("Connected to MongoDB database: %s", settings.mongodb_db_name)
    except Exception as exc:
        logger.exception("MongoDB connection failed: %s", exc)
        raise RuntimeError("Could not connect to MongoDB. Check MONGODB_URI and database availability.") from exc


async def close_mongo_connection() -> None:
    if mongo_manager.client is not None:
        mongo_manager.client.close()
        mongo_manager.client = None
        mongo_manager.database = None
        logger.info("Closed MongoDB connection.")


def get_database() -> AsyncIOMotorDatabase:
    if mongo_manager.database is None:
        raise RuntimeError("Database connection is not initialized.")
    return mongo_manager.database
