const LAYER = "ch.swisstopo-vd.ortschaftenverzeichnis_plz";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat")); const longitude = Number(params.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 45.5 || latitude > 48 || longitude < 5.5 || longitude > 11) {
    return Response.json({ error: "Invalid Swiss coordinate." }, { status: 400 });
  }
  const query = new URLSearchParams({
    geometry: `${longitude},${latitude}`, geometryType: "esriGeometryPoint", layers: `all:${LAYER}`,
    tolerance: "0", mapExtent: "5.5,45.5,11,48", imageDisplay: "1000,550,96", returnGeometry: "false", sr: "4326", lang: "en",
  });
  try {
    const response = await fetch(`https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?${query}`, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error();
    const body = await response.json() as { results?: { attributes?: { plz?: string | number; label?: string | number } }[] };
    const attributes = body.results?.[0]?.attributes;
    return Response.json({ postcode: attributes?.plz ?? attributes?.label ?? null }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ postcode: null }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
