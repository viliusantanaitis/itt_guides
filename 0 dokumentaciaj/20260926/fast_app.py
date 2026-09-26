from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from db_reader import db_reader

# Nustatome bazinį katalogą dinamiškai (veiks ir pas jus, ir Render)
BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_reader.connect()
    yield
    await db_reader.close()


app = FastAPI(lifespan=lifespan)

# CORS nustatymai
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prijungiame statinius failus ir nuotraukas naudojant dinaminį kelią
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")
app.mount("/images", StaticFiles(directory=BASE_DIR / "images"), name="images")


@app.get("/")
def read_index():
    return FileResponse(BASE_DIR / "guide.html")


@app.get("/api/filters-meta/")
async def get_filters_meta():
    try:
        return await db_reader.get_filters_meta()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/places/")
async def get_places(
    search: str = Query(None),
    city: str = Query(None),
    id: str = Query(None),
    name: str = Query(None),
    name_original: str = Query(None),
    coordinates: str = Query(None),
    address: str = Query(None),
    public_stop: str = Query(None),
    theme: str = Query(None),
    tops: str = Query(None),
    description: str = Query(None)
):
    filters = {
        'search': search,
        'city': city,
        'id': id,
        'name': name,
        'name_original': name_original,
        'coordinates': coordinates,
        'address': address,
        'public_stop': public_stop,
        'theme': theme,
        'tops': tops,
        'description': description
    }
    try:
        return await db_reader.get_places(filters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("fast_app:app", host="127.0.0.1", port=8700, reload=True)
