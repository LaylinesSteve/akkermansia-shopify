
$('.review-slider').slick({
  centerMode: true,
  centerPadding: '60px',
  dots: true,
  infinite: true,
  speed: 500,
  autoplay: true,
  autoplaySpeed: 22000,
  slidesToShow: 3,
  slidesToScroll: 1,
  responsive: [
    {
      breakpoint: 1024,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1,
        infinite: true
      }
    },
    {
      breakpoint: 600,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 480,
      settings: {
        autoplay: false,
        slidesToShow: 1,
        slidesToScroll: 1,
        centerMode: true
      }
    }
    // You can unslick at a given breakpoint now by adding:
    // settings: "unslick"
    // instead of a settings object
  ]
});
