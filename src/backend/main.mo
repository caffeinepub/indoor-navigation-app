import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Order "mo:core/Order";

actor {
  type Place = {
    name : Text;
    aliases : [Text];
    latitude : Float;
    longitude : Float;
  };

  module Place {
    public func compare(place1 : Place, place2 : Place) : Order.Order {
      Text.compare(place1.name, place2.name);
    };
  };

  let places = Map.singleton<Text, Place>(
    "MREM",
    {
      name = "MALLA REDDY ENGINEERING COLLEGE AND MANAGEMENT SCIENCES";
      aliases = ["MREM"];
      latitude = 17.633047;
      longitude = 78.505966;
    },
  );

  public query func getAllPlaces() : async [Place] {
    places.values().toArray().sort();
  };
};
