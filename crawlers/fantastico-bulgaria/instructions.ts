//TODO: go to https://www.broshura.bg/h/fantastico
//
// ul.list-offer time  with attribute date-time: 2025-07-16 Extract the date. This is the valid to date
// ul.list-offer > li > a with href attribute like this: /b/5550356#page-1
//
//
//This is the data you will see in the html
//
// <meta property="og:title" content="Фантастико брошури валидни от 10.07. до 16.07. ⭐ Broshura.bg" />
// <meta property="og:description" content="Прегледайте актуалните брошури на Фантастико до 16.07. 📄 валидни от 10.07. до 16.07. 🌟 Всички нови продукти и оферти за тази седмица 🌟 Broshura.bg" />
// <meta property="og:url" content="https://www.broshura.bg/b/5550356" />
// <meta property="og:type" content="brochure" />
// <meta property="og:image" content="https://media.marktjagd.com/17339665_2018x2904.jpg" />
//
//
// There should only be one "og:image" tag. From it we should extract the content attribute.
// From the content attribute we should pull out the image url.
// We will then fetch the image and buffer it.
// Increment the image id (in this case 17339665) fetch the next image with it and repeat until you get an error.
// After finishing console.log the number of pages found. and use the created "buffer" to create a pdf file.
//
// Download the pdf file locally and name it like this: brochures/${storeId}_${country}_${startDateString}_${endDateString}_0.pdf
// endDate should be the extracted datetime and startDate should be the current date.
// country should be default to "bulgaria"
//
//
