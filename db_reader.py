import os
import glob
import pandas as pd
from typing import List, Dict, Any

class AsyncDatabaseReader:
    def __init__(self):
        # Nurodome kelią iki 'guides_data' aplanko, kuris yra tame pačiame kataloge
        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.data_dir = os.path.join(current_dir, "guides_data")

    async def connect(self):
        """Mock metodas, kad sutaptų su FastAPI lifespan logika."""
        pass

    async def close(self):
        """Mock metodas jungties uždarymui."""
        pass

    def _load_all_data(self) -> pd.DataFrame:
        """Automatiškai randa ir sujungia visus *_itg.csv failus iš guides_data aplanko."""
        pattern = os.path.join(self.data_dir, "*.csv")
        all_files = glob.glob(pattern)
        
        if not all_files:
            return pd.DataFrame()

        df_list = [pd.read_csv(file, dtype=str) for file in all_files]
        df = pd.concat(df_list, ignore_index=True)
        
        # Pakeičiam NaN į tuščius laukus, kad nekiltų klaidų filtracijoje
        df = df.fillna("")
        return df

    async def get_filters_meta(self) -> Dict[str, List[Any]]:
        """Gauna unikalių filtrų metaduomenis iš visų CSV failų."""
        df = self._load_all_data()
        if df.empty:
            return {"cities": [], "themes": [], "tops": []}

        cities = sorted(df['city'].dropna().unique().tolist())
        themes = sorted(df['theme'].dropna().unique().tolist())
        
        # Konvertuojame tops į skaičius, jei įmanoma
        tops = sorted(list(set(str(int(float(x))) for x in df['tops'].dropna() if str(x).strip())), key=int)

        return {"cities": cities, "themes": themes, "tops": tops}

    async def get_places(self, filters: dict) -> List[Dict[str, Any]]:
        """Filtruoja įrašus iš CSV DataFrame pagal paduotus parametrus."""
        df = self._load_all_data()
        if df.empty:
            return []

        search = filters.get('search')
        city = filters.get('city')
        place_id = filters.get('id')
        name = filters.get('name')
        name_original = filters.get('name_original')
        coordinates = filters.get('coordinates')
        address = filters.get('address')
        public_stop = filters.get('public_stop') # Užklausoje ateina kaip public_stop, o faile public_stops
        theme = filters.get('theme')
        tops = filters.get('tops')
        description = filters.get('description')

        if city:
            df = df[df['city'] == city]

        if place_id and place_id.strip():
            df = df[df['id'].astype(str) == place_id.strip()]

        if name:
            df = df[df['name'].str.contains(name, case=False, na=False)]

        if name_original:
            df = df[df['name_original'].str.contains(name_original, case=False, na=False)]

        if coordinates:
            df = df[df['coordinates'] == coordinates]

        if address:
            df = df[df['address'].str.contains(address, case=False, na=False)]

        if public_stop:
            if 'public_stops' in df.columns:
                df = df[df['public_stops'].str.contains(public_stop, case=False, na=False)]

        if theme:
            df = df[df['theme'] == theme]

        if tops and tops.strip():
            try:
                top_val = int(tops)
                df = df[df['tops'].apply(lambda x: int(float(x)) <= top_val if str(x).strip() and str(x).replace('.', '', 1).isdigit() else False)]
            except ValueError:
                pass

        if description:
            df = df[df['description'].str.contains(description, case=False, na=False)]

        if search:
            search_str = search.lower()
            cols_to_search = ['city', 'id', 'name', 'name_original', 'coordinates', 'address', 'public_stops', 'theme', 'tops', 'description', 'date']
            existing_cols = [c for c in cols_to_search if c in df.columns]
            
            mask = False
            for col in existing_cols:
                mask = mask | df[col].astype(str).str.lower().str.contains(search_str, na=False, regex=False)
            df = df[mask]

        # Apribojame iki 1000 įrašų
        df = df.head(1000)

        return df.to_dict(orient='records')

db_reader = AsyncDatabaseReader()
