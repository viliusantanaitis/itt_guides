import os
import glob
import pandas as pd
from typing import List, Dict, Any

class AsyncDatabaseReader:
    def __init__(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.data_dir = os.path.join(current_dir, "guides_data")

    async def connect(self):
        pass

    async def close(self):
        pass

    def _load_all_data(self) -> pd.DataFrame:
        pattern = os.path.join(self.data_dir, "*.csv")
        all_files = glob.glob(pattern)
        
        if not all_files:
            return pd.DataFrame()

        df_list = [pd.read_csv(file, dtype=str) for file in all_files]
        df = pd.concat(df_list, ignore_index=True)
        
        # Pašaliname 'date' stulpelį, jei jis yra faile
        if 'date' in df.columns:
            df = df.drop(columns=['date'])
            
        df = df.fillna("")
        return df

    async def get_filters_meta(self) -> Dict[str, List[Any]]:
        df = self._load_all_data()
        if df.empty:
            return {"cities": [], "themes": [], "tops": []}

        cities_data = []
        for city_name, group in df.groupby('city'):
            if not city_name.strip():
                continue
            
            max_id = 0
            if 'id' in group.columns:
                valid_ids = pd.to_numeric(group['id'], errors='coerce').dropna()
                if not valid_ids.empty:
                    max_id = int(valid_ids.max())
            
            cities_data.append({
                "name": city_name,
                "count": max_id if max_id > 0 else len(group)
            })

        cities_data = sorted(cities_data, key=lambda x: x["name"])
        themes = sorted(df['theme'].dropna().unique().tolist())
        tops = sorted(list(set(str(int(float(x))) for x in df['tops'].dropna() if str(x).strip())), key=int)

        return {"cities": cities_data, "themes": themes, "tops": tops}

    async def get_places(self, filters: dict) -> List[Dict[str, Any]]:
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
        public_stop = filters.get('public_stop')
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
            # Pašalinta 'date' iš paieškos stulpelių sąrašo
            cols_to_search = ['city', 'id', 'name', 'name_original', 'coordinates', 'address', 'public_stops', 'theme', 'tops', 'description']
            existing_cols = [c for c in cols_to_search if c in df.columns]
            
            mask = False
            for col in existing_cols:
                mask = mask | df[col].astype(str).str.lower().str.contains(search_str, na=False, regex=False)
            df = df[mask]

        df = df.head(1000)

        return df.to_dict(orient='records')

db_reader = AsyncDatabaseReader()
