app.filter('range', function(){
  return function (array, start, end) {
      return array.filter(function(item, index){
          return index >= start && (index < end || end === undefined) ;
      });
  };
});
app.filter("timeago", function(){
    function filter(time) {
        return $.timeago(new Date(time * 1000));
    }
    filter.$stateful = true;
    return filter;
});
