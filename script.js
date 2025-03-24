function selectLayer1(e){
    // document.getElementById('layer1').
    // made a custom function to select the layer1 image
    
    console.log(e); // this will show the element that was clicked
    var img = document.getElementById('layer1'); // get the image element
    img.src = e.src;// set the image source to the clicked image
    img.style.opacity = 1;// set the opacity to 1
    src.appendChild(img);// append the image to the src div
}