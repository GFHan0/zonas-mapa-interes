// 1. Configuración de Supabase
const SUPABASE_URL = 'https://jwtruolnvepievxheuyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8QmGDNmTJSCnnQT22-SSBA_9UFzR0YN';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Inicialización del Mapa
const map = L.map('map', {
    zoomControl: false // Desactiva los controles de zoom por defecto
}).setView([-12.0464, -77.0428], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Agregar controles de zoom en la parte inferior izquierda
L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

// --- NUEVO: INTEGRACIÓN DEL BUSCADOR (GEOCODER) ---
// Se coloca aquí para que aparezca desde el inicio
const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: "Busca una calle o lugar...",
    errorMessage: "No se encontró el lugar.",
    position: 'topleft' // Posiciona el buscador en la esquina superior izquierda
})
.on('markgeocode', function(e) {
    const latlng = e.geocode.center;
    map.setView(latlng, 17); // Hace zoom al lugar encontrado
    alert("¡Lugar encontrado! Ahora usa tu puntero para marcar la ubicación exacta.");
})
.addTo(map);

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
                const MAX_WIDTH = 1000; 
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
                            <span style="color:blue; font-weight:bold;">Zona de Calistenia</span>
                        </div>
                    `);
            }
        });
    }
}

// 4. Función para subir la imagen a Supabase Storage
async function subirFoto(archivoOptimizado, nombreOriginal) {
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

// 5. Capturar clic en el mapa con el puntero personalizado
let ubicacionActual = null;

map.on('click', async function(e) {
    const { lat, lng } = e.latlng;
    ubicacionActual = { lat, lng };
    
    // Mostrar el modal
    document.getElementById('modal-formulario').style.display = 'flex';
    document.getElementById('formulario-zona').reset();
    document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
});

// Manejo del input de archivo
document.getElementById('foto').addEventListener('change', function(e) {
    const archivo = e.target.files[0];
    if (archivo) {
        document.getElementById('nombre-archivo').textContent = `✓ ${archivo.name}`;
    }
});

// Cerrar modal
function cerrarModal() {
    document.getElementById('modal-formulario').style.display = 'none';
    document.getElementById('formulario-zona').reset();
    document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    ubicacionActual = null;
}

// Manejo del formulario
document.getElementById('formulario-zona').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!ubicacionActual) {
        alert('Error: No hay ubicación seleccionada');
        return;
    }
    
    const descripcion = document.getElementById('descripcion').value;
    const tipoAnuncio = document.getElementById('tipoAnuncio').value;
    const materialAnuncio = document.getElementById('materialAnuncio').value;
    const persona = document.getElementById('persona').value;
    const archivo = document.getElementById('foto').files[0];
    
    if (!archivo) {
        alert('Por favor selecciona una imagen');
        return;
    }
    
    // Deshabilitar el botón de envío
    const btnEnviar = document.querySelector('.btn-confirmar');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    
    try {
        alert("Optimizando imagen...");
        const imagenParaSubir = await comprimirImagen(archivo);
        
        alert("Subiendo a la nube...");
        const urlFoto = await subirFoto(imagenParaSubir, archivo.name);
        
        if (urlFoto) {
            const { error: insertError } = await _supabase.from('puntos').insert([
                {
                    latitud: ubicacionActual.lat,
                    longitud: ubicacionActual.lng,
                    nombre_patrocinador: persona,
                    descripcion: descripcion,
                    tipo_anuncio: tipoAnuncio,
                    material_anuncio: materialAnuncio,
                    estado: 'pendiente',
                    foto_url: urlFoto 
                }
            ]);

            if (!insertError) {
                alert("¡Zona registrada! Esperando validación del administrador.");
                cerrarModal();
                
                // Mostrar marcador temporal en el mapa con transparencia
                const fotoHtml = `<img src="${urlFoto}" width="150px" style="border-radius:8px; display:block; margin:10px auto;">`;
                const marcador = L.marker([ubicacionActual.lat, ubicacionActual.lng], {
                    opacity: 0.6 // Hacer el marcador semitransparente
                })
                    .addTo(map)
                    .bindPopup(`
                        <div style="text-align:center; opacity:0.8;">
                            <b style="font-size:1.1em; color:#f39c12;">⏳ Esperando Validación</b><br>
                            <small style="color:#666;">${persona}</small><br>
                            ${fotoHtml}
                            <span style="color:#f39c12; font-weight:bold; font-size:0.9em;">En revisión</span>
                        </div>
                    `);
            } else {
                alert("Error: " + insertError.message);
            }
        }
    } catch (error) {
        alert("Error al procesar el registro: " + error.message);
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar Registro';
    }
});

// 6. Ejecutar carga inicial
cargarPuntosAprobados();
