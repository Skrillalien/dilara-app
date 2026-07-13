const demoPhotos = [
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg"
];

function loadPhotos(){

    const grid = document.getElementById("photosGrid");

    if(!grid) return;

    grid.innerHTML = "";

    demoPhotos.forEach(photo => {

        grid.innerHTML += `
            <img
                src="${photo}"
                class="photo-item"
                onclick="openImage('${photo}')">
        `;

    });

}