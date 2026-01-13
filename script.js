// 1. Configuración de Supabase
const SUPABASE_URL = 'https://jwtruolnvepievxheuyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8QmGDNmTJSCnnQT22-SSBA_9UFzR0YN';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Inicialización del Mapa
const map = L.map('map', {
    zoomControl: false 
}).setView([-12.0464, -77.0428], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Zoom abajo a la izquierda para no estorbar al buscador
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// --- BUSCADOR (GEOCODER) ---
const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: "Busca una calle o lugar...",
    errorMessage: "No se encontró el lugar.",
    position: 'topleft' 
})
.on('markgeocode', function(e) {
    const latlng = e.geocode.center;
    map.setView(latlng, 17);
    alert("¡Lugar encontrado! Ahora haz clic exacto con tu puntero negro.");
})
.addTo(map);

// --- COMPRESIÓN DE IMAGEN ---
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
                canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', 0.7); 
            };
        };
    });
}

// 3. Capturar clic y abrir Modal
let ubicacionActual = null; // IMPORTANTE: Se inicia en null

map.on('click', function(e) {
    // Aquí capturamos la latitud y longitud del clic
    ubicacionActual = { lat: e.latlng.lat, lng: e.latlng.lng };
    
    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('formulario-zona').reset();
        document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    }
});

// Cerrar Modal - Función global
function cerrarModal() {
    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'none';
    }
    document.getElementById('formulario-zona').reset();
    document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    ubicacionActual = null;
}

// Cerrar modal cuando se presiona Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModal();
    }
})

// 4. Cargar Puntos Aprobados y Pendientes
async function cargarPuntosAprobados() {
    const { data, error } = await _supabase.from('puntos').select('*');
    if (error) return;
    if (data) {
        data.forEach(p => {
            if (p.estado === 'aprobado') {
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px;">` : '';
                L.marker([p.latitud, p.longitud]).addTo(map)
                .bindPopup(`<div style="text-align:center;"><b>${p.descripcion || 'Zona de Calistenia'}</b><br>${fotoHtml}</div>`);
            } else if (p.estado === 'pendiente') {
                // Mostrar puntos pendientes con transparencia
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px;">` : '';
                L.marker([p.latitud, p.longitud], {
                    opacity: 0.5, // Semitransparente
                    title: 'Pendiente de validación'
                }).addTo(map)
                .bindPopup(`<div style="text-align:center; opacity:0.9;"><b style="color:#f39c12;">⏳ ${p.descripcion || 'Esperando validación'}</b><br><small style="color:#666;">Subido por: ${p.nombre_persona}</small><br>${fotoHtml}<br><small style="color:#f39c12; font-weight:bold;">En revisión</small></div>`);
            }
        });
    }
}

// 5. Subir Foto
async function subirFoto(archivoOptimizado) {
    const nombreArchivo = `${Date.now()}_calistenia.jpg`;
    const { data, error } = await _supabase.storage.from('fotos').upload(nombreArchivo, archivoOptimizado);
    if (error) throw error;
    const { data: urlData } = _supabase.storage.from('fotos').getPublicUrl(nombreArchivo);
    return urlData.publicUrl;
}

// 6. Manejo del Formulario (DOMContentLoaded para asegurar que existan los IDs)
document.addEventListener('DOMContentLoaded', function() {
    // Manejador del input de archivo
    const fotoInput = document.getElementById('foto');
    if (fotoInput) {
        fotoInput.addEventListener('change', function(e) {
            const archivo = e.target.files[0];
            const nombreArchivSpan = document.getElementById('nombre-archivo');
            
            if (archivo) {
                nombreArchivSpan.innerHTML = `
                    <span style="color: #27ae60; font-weight: bold;">✓ ${archivo.name}</span>
                    <br>
                    <small style="color: #999; margin-top: 5px; display: block;">${(archivo.size / 1024).toFixed(2)} KB</small>
                    <button type="button" style="margin-top: 10px; padding: 5px 10px; background: #e67e22; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.85em;" onclick="cambiarImagen()">Cambiar imagen</button>
                `;
            } else {
                nombreArchivSpan.textContent = 'Ningún archivo seleccionado';
            }
        });
    }

    const form = document.getElementById('formulario-zona');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // VERIFICACIÓN DE SEGURIDAD PARA EVITAR EL ERROR DE NULL
            if (!ubicacionActual || ubicacionActual.lat === undefined) {
                alert('❌ Error: No se detectó la ubicación. Haz clic de nuevo en el mapa.');
                return;
            }

            const btnEnviar = document.querySelector('.btn-confirmar');
            const archivo = document.getElementById('foto').files[0];
            
            if (!archivo) { 
                alert('⚠️ Selecciona una foto');
                return;
            }

            try {
                btnEnviar.disabled = true;
                btnEnviar.textContent = 'Procesando...';

                const imagenComprimida = await comprimirImagen(archivo);
                const urlFinal = await subirFoto(imagenComprimida);

                if (urlFinal) {
                    const { error: insertError } = await _supabase.from('puntos').insert([{
                        latitud: ubicacionActual.lat,
                        longitud: ubicacionActual.lng,
                        nombre_persona: document.getElementById('persona').value,
                        nombre_patrocinador: document.getElementById('persona').value,
                        descripcion: document.getElementById('descripcion').value,
                        tipo_anuncio: document.getElementById('tipoAnuncio').value,
                        estado: 'pendiente',
                        foto_url: urlFinal
                    }]);

                    if (!insertError) {
                        // Agregar marcador semitransparente al mapa
                        const descripcion = document.getElementById('descripcion').value;
                        const persona = document.getElementById('persona').value;
                        
                        agregarMarcadorPendiente(
                            ubicacionActual.lat,
                            ubicacionActual.lng,
                            descripcion,
                            persona,
                            urlFinal
                        );
                        
                        // Mostrar modal de éxito
                        mostrarExito();
                        
                        // Cerrar modal del formulario después de 1.2 segundos
                        setTimeout(() => {
                            cerrarModal();
                        }, 1200);
                    } else {
                        alert('❌ Error: ' + insertError.message);
                    }
                }
            } catch (err) {
                alert("❌ Error: " + err.message);
            } finally {
                btnEnviar.disabled = false;
                btnEnviar.textContent = 'Enviar Registro';
            }
        });
    }
});

// Función para cambiar la imagen seleccionada
function cambiarImagen() {
    document.getElementById('foto').click();
}

// Función para mostrar el modal de éxito
function mostrarExito() {
    const modalExito = document.getElementById('modal-exito');
    const spinnerCarga = document.getElementById('spinner-carga');
    const checkExito = document.getElementById('check-exito');
    
    // Mostrar modal
    modalExito.style.display = 'flex';
    spinnerCarga.style.display = 'block';
    checkExito.style.display = 'none';
    
    // Cambiar a check después de 0.8 segundos
    setTimeout(() => {
        spinnerCarga.style.display = 'none';
        checkExito.style.display = 'block';
    }, 800);
    
    // Cerrar modal después de 2 segundos totales
    setTimeout(() => {
        modalExito.style.display = 'none';
    }, 2000);
}

// Guardar ubicación y datos del último registro para el preview
let ultimoRegistro = {
    latitud: null,
    longitud: null,
    descripcion: null,
    nombre_persona: null,
    foto_url: null,
    marcador: null
};

// Función para agregar marcador de preview pendiente
function agregarMarcadorPendiente(latitud, longitud, descripcion, nombre_persona, foto_url) {
    const fotoHtml = foto_url ? `<img src="${foto_url}" width="150px" style="border-radius:8px; display:block; margin:10px auto;">` : '';
    
    // Crear marcador semitransparente
    const marcador = L.marker([latitud, longitud], {
        opacity: 0.5,
        title: 'Pendiente de validación'
    }).addTo(map)
    .bindPopup(`<div style="text-align:center; opacity:0.9;"><b style="color:#f39c12;">⏳ ${descripcion}</b><br><small style="color:#666;">Subido por: ${nombre_persona}</small><br>${fotoHtml}<br><small style="color:#f39c12; font-weight:bold;">En revisión</small></div>`);
    
    marcador.openPopup();
    
    // Guardar referencia del marcador
    ultimoRegistro = {
        latitud,
        longitud,
        descripcion,
        nombre_persona,
        foto_url,
        marcador
    };
}

cargarPuntosAprobados();
