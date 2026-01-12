// 1. Configuración de Supabase
const SUPABASE_URL = 'https://jwtruolnvepievxheuyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8QmGDNmTJSCnnQT22-SSBA_9UFzR0YN';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Inicialización del Mapa
const map = L.map('map').setView([-12.0464, -77.0428], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --- NUEVA FUNCIÓN DE COMPRESIÓN TÉCNICA ---
async function comprimirImagen(archivo) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(archivo);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; // Calidad ideal para visualización web/móvil
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convertimos a Blob (formato JPEG al 70% de calidad)
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.7); 
            };
        };
    });
}

// 3. Función para cargar los puntos aprobados
async function cargarPuntosAprobados() {
    const { data, error } = await _supabase.from('puntos').select('*');

    if (error) {
        console.error("Error al cargar puntos:", error);
        return;
    }

    if (data) {
        data.forEach(p => {
            if (p.estado === 'aprobado') {
                const fotoHtml = p.foto_url 
                    ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px; display:block; margin:10px auto;">` 
                    : '<p style="text-align:center;">Sin foto disponible</p>';

                L.marker([p.latitud, p.longitud])
                    .addTo(map)
                    .bindPopup(`
                        <div style="text-align:center;">
                            <b style="font-size:1.1em;">${p.nombre_patrocinador}</b><br>
                            ${fotoHtml}
                            <span style="color:blue; font-weight:bold;">Punto de importancia</span>
                        </div>
                    `);
            }
        });
    }
}

// 4. Función para subir la imagen a Supabase Storage
async function subirFoto(archivoOptimizado, nombreOriginal) {
    // Generamos un nombre único para el archivo comprimido
    const nombreArchivo = `${Date.now()}_comprimido.jpg`;
    
    const { data, error } = await _supabase.storage
        .from('fotos') 
        .upload(nombreArchivo, archivoOptimizado, {
            contentType: 'image/jpeg'
        });

    if (error) {
        alert("Error al subir la imagen: " + error.message);
        return null;
    }

    const { data: urlData } = _supabase.storage.from('fotos').getPublicUrl(nombreArchivo);
    return urlData.publicUrl;
}

// 5. Capturar clic en el mapa
map.on('click', async function(e) {
    const { lat, lng } = e.latlng;
    const nombre = prompt("¿Descripción de esta Zona de Interés?");
    
    if (!nombre) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async () => {
        const file = input.files[0];
        if (file) {
            alert("Optimizando imagen para ahorrar espacio...");
            
            // Comprimimos antes de subir
            const imagenParaSubir = await comprimirImagen(file);
            
            alert("Subiendo a la nube...");
            const urlFoto = await subirFoto(imagenParaSubir, file.name);
            
            if (urlFoto) {
                const { error: insertError } = await _supabase.from('puntos').insert([
                    {
                        latitud: lat,
                        longitud: lng,
                        nombre_patrocinador: nombre,
                        estado: 'pendiente',
                        foto_url: urlFoto 
                    }
                ]);

                if (!insertError) {
                    alert("¡Zona registrada! Aparecerá tras la validación del administrador.");
                } else {
                    alert("Error en base de datos: " + insertError.message);
                }
            }
        }
    };
    input.click();
});

// 6. Ejecutar la carga inicial
cargarPuntosAprobados();